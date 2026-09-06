/**
 * Spike S3 — the x402 seller half.
 *
 * A `node:http` server on 127.0.0.1:4021 with one route, `POST /tasks`. It is built
 * from @x402/core primitives rather than a framework middleware because the price is
 * dynamic (amount x 1.15) and because `settle` has to run *after* the work, not before
 * the handler: the real `POST /tasks` settles only once `TaskEscrow.post` has succeeded.
 *
 * Order, matching the frozen T-01 handler order:
 *   verify (no money moves) -> replay check -> screen -> post -> settle -> 201/200
 *
 * Prints the payer address and the settle tx hash. Never a key, never a raw
 * PAYMENT-SIGNATURE value.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { getDefaultAsset } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { privateKeyToAccount } from "viem/accounts";
import { formatUnits2dp, priceUnits } from "./price.ts";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname);
} catch {
  // already exported into the environment — fine
}

const HOST = "127.0.0.1";
const PORT = 4021;
const RESOURCE_URL = `http://${HOST}:${PORT}/tasks`;

const NETWORK = requireEnv("X402_NETWORK") as `${string}:${string}`;
const USDC_ADDRESS = requireEnv("USDC_ADDRESS");
const FACILITATOR_URL = requireEnv("X402_FACILITATOR_URL");
/** Address only. The relayer key is never used to sign anything in this spike. */
const PAY_TO = privateKeyToAccount(requireEnv("RELAYER_PRIVATE_KEY") as `0x${string}`).address;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env var ${name}`);
  return value;
}

/**
 * The EIP-712 domain of the asset. `buildPaymentRequirements` does NOT fill this in
 * when the price is given as an explicit `{ asset, amount }` — without `extra.name`
 * and `extra.version` on the 402, the client refuses to sign:
 *   "EIP-712 domain parameters (name, version) are required in payment requirements".
 * The library's own table has it, so the seller reads it from there.
 */
const DEFAULT_ASSET = getDefaultAsset(NETWORK);
if (DEFAULT_ASSET.asset.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
  throw new Error(`USDC_ADDRESS ${USDC_ADDRESS} is not the default asset for ${NETWORK} (${DEFAULT_ASSET.asset})`);
}
const ASSET_EIP712_DOMAIN = { name: DEFAULT_ASSET.name, version: DEFAULT_ASSET.version };

/** Results already settled, keyed by the EIP-3009 authorization nonce. */
const settledByNonce = new Map<string, { taskId: number; settle_tx: string }>();
let settleCalls = 0;
let nextTaskId = 1;

/** Stand-in for the screening gate (T-06/T-21). This spike always accepts. */
function stubScreen(): { accepted: true } {
  return { accepted: true };
}

/** Stand-in for TaskEscrow.post via TxQueue (T-07/T-12). No contract is touched. */
async function stubPost(): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return nextTaskId++;
}

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme());

/** The authorization nonce is the idempotency key: one signed authorization, one settle. */
function authorizationNonce(payload: PaymentPayload): string {
  const authorization = (payload.payload as { authorization?: { nonce?: string } }).authorization;
  if (!authorization?.nonce) throw new Error("no authorization.nonce in the decoded payload");
  return authorization.nonce.toLowerCase();
}

function authorizationPayer(payload: PaymentPayload): string {
  const authorization = (payload.payload as { authorization?: { from?: string } }).authorization;
  return authorization?.from ?? "unknown";
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function handleTasks(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let amountUsdc: string;
  try {
    amountUsdc = (JSON.parse(raw) as { amount_usdc?: string }).amount_usdc ?? "";
  } catch {
    sendJson(res, 400, { error: "bad_json" });
    return;
  }

  let amountUnits: bigint;
  try {
    amountUnits = priceUnits(amountUsdc);
  } catch (error) {
    sendJson(res, 400, { error: "bad_amount", reason: (error as Error).message });
    return;
  }

  // 1. Requirements are built inside the handler, so the amount can be dynamic.
  const requirements: PaymentRequirements[] = await resourceServer.buildPaymentRequirements({
    scheme: "exact",
    network: NETWORK,
    payTo: PAY_TO,
    price: { asset: USDC_ADDRESS, amount: amountUnits.toString(), extra: ASSET_EIP712_DOMAIN },
    maxTimeoutSeconds: 300,
  });
  const resourceInfo = {
    url: RESOURCE_URL,
    description: "Legwork task",
    mimeType: "application/json",
  };

  const signatureHeader = req.headers["payment-signature"];

  // 2. No PAYMENT-SIGNATURE: answer 402 with the requirements.
  if (typeof signatureHeader !== "string" || signatureHeader.length === 0) {
    const paymentRequired = await resourceServer.createPaymentRequiredResponse(
      requirements,
      resourceInfo,
      "payment_required",
    );
    console.log("402 sent");
    sendJson(
      res,
      402,
      {
        error: "payment_required",
        price_usdc: formatUnits2dp(amountUnits),
        x402Version: paymentRequired.x402Version,
        resource: paymentRequired.resource,
        accepts: paymentRequired.accepts,
      },
      { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(paymentRequired) },
    );
    return;
  }

  console.log("PAYMENT-SIGNATURE received");

  let payload: PaymentPayload;
  try {
    payload = decodePaymentSignatureHeader(signatureHeader);
  } catch (error) {
    sendJson(res, 402, { error: "payment_required", reason: `undecodable header: ${(error as Error).message}` });
    return;
  }

  // 3. verify — moves no money.
  const verification = await resourceServer.verifyPayment(payload, requirements[0]);
  if (!verification.isValid) {
    console.log(`verify failed reason=${verification.invalidReason ?? "unknown"}`);
    sendJson(res, 402, {
      error: "payment_required",
      reason: verification.invalidReason ?? "invalid_payment",
      price_usdc: formatUnits2dp(amountUnits),
    });
    return;
  }
  const payer = verification.payer ?? authorizationPayer(payload);
  console.log(`verify ok payer=${payer}`);

  // 4. Idempotency: a nonce we have already settled is answered from the map.
  const nonce = authorizationNonce(payload);
  const alreadySettled = settledByNonce.get(nonce);
  if (alreadySettled) {
    console.log(`replay=true settle_calls=${settleCalls}`);
    console.log(`200 {taskId:${alreadySettled.taskId}}`);
    sendJson(res, 200, alreadySettled);
    return;
  }

  // 5. The work: screen, then post. Stubs — this spike touches no contract.
  stubScreen();
  const taskId = await stubPost();
  console.log(`post stub taskId=${taskId}`);

  // 6. settle — after the work, never before it.
  const settlement = await resourceServer.settlePayment(payload, requirements[0]);
  settleCalls++;
  if (!settlement.success) {
    console.log(`settle failed reason=${settlement.errorReason ?? "unknown"} float_absorbed=true`);
    sendJson(res, 502, { error: "settle_failed", reason: settlement.errorReason ?? "unknown", taskId });
    return;
  }
  console.log(`settle ok tx=${settlement.transaction}`);

  const result = { taskId, settle_tx: settlement.transaction };
  settledByNonce.set(nonce, result);
  console.log(`200 {taskId:${taskId}}`);
  sendJson(res, 200, result, { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settlement) });
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/tasks") {
    handleTasks(req, res).catch((error: unknown) => {
      console.log(`handler error: ${(error as Error).message}`);
      if (!res.headersSent) sendJson(res, 500, { error: "internal" });
    });
    return;
  }
  sendJson(res, 404, { error: "not_found" });
});

await resourceServer.initialize();
server.listen(PORT, HOST, () => {
  console.log(`s3-x402 seller listening on http://${HOST}:${PORT}/tasks`);
  console.log(`network=${NETWORK} asset=${USDC_ADDRESS} payTo=${PAY_TO} facilitator=${FACILITATOR_URL}`);
});
