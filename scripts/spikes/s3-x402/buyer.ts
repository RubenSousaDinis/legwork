/**
 * Spike S3 — the x402 buyer half.
 *
 * Wraps `fetch` with @x402/fetch and a viem account, calls `POST /tasks`, and logs
 * every request/response so the 402 -> retry-with-header -> 200 sequence is visible.
 *
 * Then the replay: the *exact* PAYMENT-SIGNATURE header value the wrapper sent on the
 * second request is re-sent with a plain `fetch`. Re-signing a fresh authorization
 * would prove nothing — the point is that one signed authorization can only be
 * charged once, so the same header must come back with the same taskId.
 */

import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname);
} catch {
  // already exported into the environment — fine
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env var ${name}`);
  return value;
}

const RESOURCE_URL = "http://127.0.0.1:4021/tasks";
const NETWORK = requireEnv("X402_NETWORK") as `${string}:${string}`;
const account = privateKeyToAccount(requireEnv("BUYER_PRIVATE_KEY") as `0x${string}`);

/** Every PAYMENT-SIGNATURE the wrapper put on the wire, in order. Never printed raw. */
const sentSignatures: string[] = [];

function signatureOf(input: RequestInfo | URL, init?: RequestInit): string | null {
  const fromInit = init?.headers ? new Headers(init.headers).get("PAYMENT-SIGNATURE") : null;
  if (fromInit) return fromInit;
  return input instanceof Request ? input.headers.get("PAYMENT-SIGNATURE") : null;
}

const loggingFetch: typeof fetch = async (input, init) => {
  const signature = signatureOf(input, init);
  if (signature) sentSignatures.push(signature);
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  console.log(`--> ${method} ${RESOURCE_URL} payment-signature=${signature ? "present" : "absent"}`);
  const response = await fetch(input, init);
  console.log(`<-- ${response.status} ${response.statusText}`);
  return response;
};

const fetchWithPayment = wrapFetchWithPaymentFromConfig(loggingFetch, {
  schemes: [{ network: NETWORK, client: new ExactEvmScheme(account) }],
  // The task costs 3.45, above the SDK's default $1 per-payment ceiling.
  spendControls: { maxAmountPerPayment: "$5" },
});

console.log(`buyer=${account.address} resource=${RESOURCE_URL}`);
console.log("--- paid call ---");

const paid = await fetchWithPayment(RESOURCE_URL, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ amount_usdc: "3.00" }),
});
const paidBody = (await paid.json()) as { taskId?: number; settle_tx?: string };
console.log(`paid call -> ${paid.status} ${JSON.stringify(paidBody)}`);

console.log("--- replay: the same PAYMENT-SIGNATURE header, plain fetch ---");
const replayedSignature = sentSignatures.at(-1);
if (!replayedSignature) throw new Error("the wrapper never sent a PAYMENT-SIGNATURE header");
console.log(`replaying the captured header (${replayedSignature.length} chars, not printed)`);

const replayed = await fetch(RESOURCE_URL, {
  method: "POST",
  headers: { "content-type": "application/json", "PAYMENT-SIGNATURE": replayedSignature },
  body: JSON.stringify({ amount_usdc: "3.00" }),
});
const replayBody = (await replayed.json()) as { taskId?: number; settle_tx?: string };
console.log(`replay -> ${replayed.status} ${JSON.stringify(replayBody)}`);

const sameTask = paidBody.taskId !== undefined && paidBody.taskId === replayBody.taskId;
console.log(
  sameTask
    ? `REPLAY OK: same taskId ${paidBody.taskId}, the authorization was charged once`
    : `REPLAY FAIL: paid taskId=${paidBody.taskId} replay taskId=${replayBody.taskId}`,
);
