/**
 * `check_task` against the API it actually talks to.
 *
 * `POST /check` screens the whole envelope, amount included; the contract's `check_task` input
 * carries no amount. The first live run (T-34) found the gap: the tool sent none, the API
 * answered `400 invalid_request` for `amount_usdc`, and the tool passed that body on as an
 * accepted dry run the contract then rejected. Two things are pinned here: the amount goes on
 * the wire at the floor for the type, and a body that is neither a refusal nor an acceptance
 * comes back as a tool error the agent can read, not as a contract violation.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PRICE_FLOOR_USDC } from '@legwork/shared';
import { MemoryTokenStore } from '../src/keychain';
import { DASHBOARD_URL, PRICE_USDC, VERIFY_OPEN_ENVELOPE, connect, mockApi } from './harness';

const api = mockApi();

beforeAll(() => api.server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  api.server.resetHandlers();
  api.seen.length = 0;
  api.checkResponse = { status: 200, body: { accepted: true, spec_hash: `0x${'ab'.repeat(32)}`, price_usdc: PRICE_USDC } };
});
afterAll(() => api.server.close());

type CallResult = {
  isError?: boolean;
  content: { type: string; text: string }[];
  structuredContent: Record<string, unknown>;
};

async function checkTask(): Promise<CallResult> {
  const harness = await connect({ mode: 'local', tokenStore: new MemoryTokenStore() });
  try {
    return (await harness.client.callTool({
      name: 'check_task',
      arguments: { task_type: VERIFY_OPEN_ENVELOPE.task_type, spec: VERIFY_OPEN_ENVELOPE.spec },
    })) as CallResult;
  } finally {
    await harness.close();
  }
}

describe('check_task', () => {
  it('checkTaskSendsTheFloorAmount', async () => {
    const result = await checkTask();

    const sent = api.seen.find((r) => new URL(r.url).pathname === '/check');
    expect(sent, 'POST /check was made').toBeDefined();
    expect((sent!.body as { amount_usdc?: unknown }).amount_usdc).toBe(
      PRICE_FLOOR_USDC[VERIFY_OPEN_ENVELOPE.task_type],
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent.accepted).toBe(true);
    expect(result.structuredContent.price_usdc).toBe(PRICE_USDC);
    expect(result.structuredContent.dashboard_url).toBe(DASHBOARD_URL);
  });

  it('checkTaskInvalidRequestIsAToolError', async () => {
    api.checkResponse = {
      status: 400,
      body: { error: 'invalid_request', field: 'amount_usdc', reason: 'Invalid input: expected number, received undefined' },
    };

    const result = await checkTask();

    // A tool error, read by the agent — never an accepted result the contract check throws on.
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('400');
    expect(result.content[0]?.text).toContain('amount_usdc');
    expect(result.structuredContent.dashboard_url).toBe(DASHBOARD_URL);
    expect(result.structuredContent.accepted).toBeUndefined();
  });
});
