/**
 * The one typed client over the Task API.
 *
 * Every tool goes through here, which is why there is exactly one place that decides what a
 * header is called and exactly one place that could ever attach a credential. It logs nothing
 * — not a header, not a body: a buyer token is a bearer credential and a log line is the
 * easiest place in a system to leak one.
 */
import { HEADERS } from '@legwork/shared';
import type { ToolContext } from './context';

export interface HttpResponse<T> {
  status: number;
  body: T;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // A non-JSON body from a JSON API is a proxy or an outage, never a contract response.
    throw new Error(`Legwork API returned a non-JSON body (HTTP ${response.status})`);
  }
}

async function send<T>(
  ctx: ToolContext,
  path: string,
  init: RequestInit & { headers?: Record<string, string> },
): Promise<HttpResponse<T>> {
  const response = await ctx.fetch(`${ctx.apiBase}${path}`, init);
  return { status: response.status, body: (await readJson(response)) as T };
}

function jsonHeaders(buyerToken?: string): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (buyerToken) headers[HEADERS.buyerToken] = buyerToken;
  return headers;
}

/** `POST /check` — the dry run. 200 is `{accepted, spec_hash, price_usdc}`, 422 is a refusal. */
export function postCheck<T>(ctx: ToolContext, envelope: unknown): Promise<HttpResponse<T>> {
  return send<T>(ctx, '/check', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(envelope),
  });
}

/**
 * `POST /tasks` with no credential of any kind, so the API answers 402 with its payment
 * requirements. Hosted mode uses this to quote a price it cannot pay; it is the only request
 * in this package that expects a 402 and the only one that must never carry a payment header.
 */
export function postTaskUnpaid<T>(ctx: ToolContext, envelope: unknown): Promise<HttpResponse<T>> {
  return send<T>(ctx, '/tasks', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(envelope),
  });
}

/** `GET /tasks/:id?wait=n`. A buyer token, when there is one, is what reveals `proof.url`. */
export function getTask<T>(
  ctx: ToolContext,
  taskId: string,
  waitSeconds: number,
  buyerToken?: string,
): Promise<HttpResponse<T>> {
  const headers = jsonHeaders(buyerToken);
  delete headers['content-type'];
  return send<T>(ctx, `/tasks/${encodeURIComponent(taskId)}?wait=${waitSeconds}`, {
    method: 'GET',
    headers,
  });
}

export function postApprove<T>(
  ctx: ToolContext,
  taskId: string,
  buyerToken: string,
): Promise<HttpResponse<T>> {
  return send<T>(ctx, `/tasks/${encodeURIComponent(taskId)}/approve`, {
    method: 'POST',
    headers: jsonHeaders(buyerToken),
    body: JSON.stringify({}),
  });
}

export function postDispute<T>(
  ctx: ToolContext,
  taskId: string,
  reason: string,
  buyerToken: string,
): Promise<HttpResponse<T>> {
  return send<T>(ctx, `/tasks/${encodeURIComponent(taskId)}/dispute`, {
    method: 'POST',
    headers: jsonHeaders(buyerToken),
    body: JSON.stringify({ reason }),
  });
}

/**
 * `GET /public/preflight` — the same numbers, computed server-side. Local mode without a
 * subgraph URL asks the API rather than inventing a count.
 */
export function getPublicPreflight<T>(
  ctx: ToolContext,
  query: { task_type: string; area: string },
): Promise<HttpResponse<T>> {
  const search = new URLSearchParams({ task_type: query.task_type, area: query.area });
  return send<T>(ctx, `/public/preflight?${search.toString()}`, { method: 'GET' });
}
