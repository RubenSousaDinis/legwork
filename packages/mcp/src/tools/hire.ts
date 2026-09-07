/**
 * `hire_human`, local — the one tool in this package that spends money.
 *
 * An agent calls it, `POST /tasks` answers 402, the x402 client signs an EIP-3009
 * authorization, the request goes again and comes back 201 with a task id. All of that is
 * one tool call and no human in the loop, which is the whole beat this product is sold on.
 *
 * Three rules shape the file:
 *
 * - **The key is never here.** `createPayFetch` is handed one by the binary and closes over
 *   a viem account. Nothing below reads the environment — the binary is the only place that
 *   does, and the verification for this task greps this file to prove it — and neither the
 *   key nor the address it derives is logged, stringified or returned at any level.
 * - **A refused task moves no money.** The API verifies the authorization before it screens
 *   and settles only after the escrow is posted, so a 422 is a refusal that was never
 *   charged. It travels back untouched, with the no-retry sentence, and is never retried or
 *   rephrased here.
 * - **The `buyer_token` goes to the token store and nowhere else.** It is the only thing
 *   standing between a stranger and someone else's escrow, and task ids are public.
 */
import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ExactEvmScheme } from '@x402/evm';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import {
  HireHumanInput as HireHumanInputSchema,
  MAX_TASK_AMOUNT_USDC,
  fromUsdcUnits,
  priceWithFee,
  toUsdcUnits,
} from '@legwork/shared';
import {
  dashboardUrlFor,
  type HireHumanInput,
  type HireHumanResult,
  type LocalHireHandler,
} from '../context';
import { isRefusal } from './check';

/** Base Sepolia. The only network this client will sign for. */
export const PAYMENT_NETWORK = 'eip155:84532' as const;

/**
 * A ceiling on any single authorization this key will ever sign: the largest task the
 * escrow accepts, with the fee on top (10.00 + 1.50). The library's own default is $1, which
 * would refuse the 3.45 the demo task costs; naming the real bound is better than turning
 * spend controls off.
 */
const MAX_PAYMENT_USD = `$${fromUsdcUnits(priceWithFee(toUsdcUnits(MAX_TASK_AMOUNT_USDC))).toFixed(2)}`;

/**
 * A `fetch` that answers an x402 challenge. The first request carries no credential — the
 * server has not asked yet and a header sent unprompted is a signature given away for
 * nothing. Only a 402 makes the library sign, and only the retry carries
 * `PAYMENT-SIGNATURE`.
 *
 * `baseFetch` is a parameter so a test can drive the whole round trip against a local
 * server, and so T-16b can swap the transport without touching `localHire`.
 */
export function createPayFetch(privateKey: Hex, baseFetch: typeof fetch = fetch): typeof fetch {
  const account = privateKeyToAccount(privateKey);
  const client = new x402Client()
    .register(PAYMENT_NETWORK, new ExactEvmScheme(account))
    .setSpendControls({ maxAmountPerPayment: MAX_PAYMENT_USD });
  return wrapFetchWithPayment(baseFetch, client) as typeof fetch;
}

// ------------------------------------------------------------------- the tool

/** The 201 of `POST /tasks`, as this tool reads it. */
interface PostedBody {
  task_id?: unknown;
  buyer_token?: unknown;
  status?: unknown;
  eta_seconds?: unknown;
  poll_after_seconds?: unknown;
  dashboard_url?: unknown;
}

/**
 * Everything that can go wrong between the tool call and a task id, named as a step rather
 * than as an exception. A stack trace tells an agent nothing it can act on, and a payment
 * library's message is one refactor away from carrying an address.
 */
export type HireFailureStep = 'payment_signing_failed' | 'api_unreachable';

const FAILURE_REASON: Record<HireFailureStep, string> = {
  payment_signing_failed: 'signing the x402 payment authorization failed; no request was paid',
  api_unreachable: 'the Task API did not answer; nothing was posted and nothing was charged',
};

/**
 * Substrings the x402 client puts in its own throws. Matched to name the step and then
 * dropped: the message itself never reaches the agent.
 */
const PAYMENT_STEP_MARKERS = [
  'payment payload',
  'payment requirements',
  'Payment already attempted',
  'spendControls',
];

function stepOf(error: unknown): HireFailureStep {
  const message = error instanceof Error ? error.message : String(error);
  return PAYMENT_STEP_MARKERS.some((marker) => message.includes(marker))
    ? 'payment_signing_failed'
    : 'api_unreachable';
}

/**
 * `mcp-contract.ts`'s `hire_human` output is a union of the two results and a refusal; a
 * 400, a cap or an unreachable API is none of those. The body travels back as the API wrote
 * it, with the dashboard to send a principal to and `isError` so the agent stops. The cast
 * is deliberate and stops here — widening `LocalHireHandler` would change T-27's interface.
 */
function hireError(body: Record<string, unknown>): HireHumanResult {
  return { ...body, isError: true } as unknown as HireHumanResult;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The envelope as it goes on the wire: the fields the caller decided and nothing else.
 *
 * A window the caller did not set is left off so `POST /tasks` applies the shared defaults;
 * nothing here ever invents one — the API shortens the dispute window to
 * `DEMO_DISPUTE_WINDOW_S` for an allowlisted buyer, and a number hard-coded here would
 * quietly override that.
 */
function postBody(input: HireHumanInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    task_type: input.task_type,
    spec: input.spec,
    amount_usdc: input.amount_usdc,
  };
  if (input.need_by) body.need_by = input.need_by;
  // Forwarded exactly as given: the API verifies it against the ERC-8004 IdentityRegistry
  // and never trusts it from the request.
  if (input.agent_id) body.agent_id = input.agent_id;
  // The three windows are forwarded only when the caller set them — `HireHumanInput`
  // advertises them — and never invented here: absent, the API applies the shared defaults
  // and shortens the dispute window itself for an allowlisted buyer.
  const windows = input as { claim_ttl_s?: unknown; submit_ttl_s?: unknown; dispute_window_s?: unknown };
  for (const key of ['claim_ttl_s', 'submit_ttl_s', 'dispute_window_s'] as const) {
    if (typeof windows[key] === 'number') body[key] = windows[key];
  }
  return body;
}

/**
 * Post a task and fund its escrow, paying for real.
 *
 * `ctx.fetch` is the paying fetch the binary built; the 402, the signature and the retry all
 * happen inside it, which is why there is no payment code in this function.
 */
export const localHire: LocalHireHandler = async (input, ctx) => {
  const dashboard_url = dashboardUrlFor(ctx);

  const parsed = HireHumanInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return hireError({
      error: 'invalid_request',
      field: issue ? issue.path.map(String).join('.') || '(root)' : '(root)',
      reason: issue?.message ?? 'the hire_human input does not match the contract',
      dashboard_url,
    });
  }

  let response: Response;
  try {
    response = await ctx.fetch(`${ctx.apiBase}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(postBody(parsed.data as HireHumanInput)),
    });
  } catch (error) {
    const step = stepOf(error);
    return hireError({ error: step, reason: FAILURE_REASON[step], dashboard_url });
  }

  const body = await readJson(response);

  // A refusal is the API's word, passed on as it stands. No retry, no rephrase, no second
  // authorization: the payment was verified and never settled, so this moved no money.
  if (response.status === 422 && isRefusal(body)) return body;

  if (response.status === 201) {
    const posted = body as PostedBody;
    if (typeof posted.task_id !== 'string' || typeof posted.buyer_token !== 'string') {
      return hireError({
        error: 'malformed_posted_body',
        reason: 'POST /tasks answered 201 without a task_id and a buyer_token',
        dashboard_url,
      });
    }
    // The token is written before the result is built, and it is the one field the result
    // does not carry. Without a store there is nowhere to put it, and approve_task will ask
    // the agent for it by hand rather than this failing a task that is already posted.
    await ctx.tokenStore?.set(posted.task_id, posted.buyer_token);

    return {
      task_id: posted.task_id,
      status: 'open' as const,
      eta_seconds: Number(posted.eta_seconds),
      poll_after_seconds: Number(posted.poll_after_seconds),
      dashboard_url:
        typeof posted.dashboard_url === 'string'
          ? posted.dashboard_url
          : dashboardUrlFor(ctx, posted.task_id),
    };
  }

  const errorBody = asRecord(body);
  return hireError({
    error: `http_${response.status}`,
    ...errorBody,
    dashboard_url,
  });
};

// ---------------------------------------------------------------- the insert

/** Every insert line, hard-capped. The frame is 72 columns and a wrap ruins the take. */
export const INSERT_LINE_MAX = 72;

const money = (usdc: number): string => usdc.toFixed(2);
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Line 1, fitted. A place name can be 120 characters and a locality 80, so the place is what
 * gets shortened — the task type and the money are the two things the frame is for.
 */
function callLine(input: HireHumanInput, amount: number): string {
  const head = `hire_human(${input.task_type}`;
  const tail = ` · ${money(amount)} USDC)`;
  const where = whereOf(input);
  if (where === null) return `${head}${tail}`;

  const budget = INSERT_LINE_MAX - head.length - tail.length - 3;
  const shown = where.length <= budget ? where : `${where.slice(0, Math.max(budget - 3, 0))}...`;
  return `${head} · ${shown}${tail}`;
}

/** `<place name>, <locality>`, when the task type has a place. `compare-two` has none. */
function whereOf(input: HireHumanInput): string | null {
  if (input.task_type === 'compare-two') return null;
  const place = (input.spec as { place?: { name?: string; locality?: string } }).place;
  if (!place?.name || !place.locality) return null;
  return `${place.name}, ${place.locality}`;
}

function postedTaskId(result: HireHumanResult): string | null {
  const record = asRecord(result);
  return typeof record.task_id === 'string' && record.isError !== true ? record.task_id : null;
}

/**
 * The three lines the filmed insert shows, for a hire that came back 201. Pure: the binary
 * decides whether `LEGWORK_INSERT` asked for them and which stream they go to, because the
 * stdio server's stdout is the MCP protocol and this file must not read the environment.
 *
 * The figures come from the shared fee arithmetic — the same `priceWithFee` the seller
 * prices with — so 3.00 for the worker is 3.45 charged and 0.45 fee, every time.
 */
export function insertLines(input: HireHumanInput, result: HireHumanResult): string[] {
  const taskId = postedTaskId(result);
  if (taskId === null) return [];

  const amount = input.amount_usdc;
  const price = fromUsdcUnits(priceWithFee(toUsdcUnits(amount)));
  const fee = round2(price - amount);

  return [
    callLine(input, amount),
    `→ 402 payment_required · ${money(price)} USDC (${money(amount)} + ${money(fee)} fee) · ${PAYMENT_NETWORK}`,
    `→ 201 { task_id: ${taskId} } · escrow locked ${money(price)}`,
  ];
}
