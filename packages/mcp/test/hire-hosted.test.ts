/**
 * The hosted `hire_human` quotes; it never pays and never pretends to have.
 *
 * Two requests go out and neither carries a payment credential — that is checked against what
 * the mock actually received, not against the result. The price and the payee are lifted out
 * of the 402 the API sent, so the 3.45 an agent is quoted is the 3.45 the escrow will lock.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { INSTALL_LINE, NO_RETRY_SENTENCE } from '@legwork/shared';
import {
  DASHBOARD_URL,
  API_BASE,
  PAY_TO,
  PRICE_USDC,
  REFUSAL,
  VERIFY_OPEN_ENVELOPE,
  connect,
  mockApi,
} from './harness';

const api = mockApi();

beforeAll(() => api.server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  api.server.resetHandlers();
  api.seen.length = 0;
  api.checkResponse = {
    status: 200,
    body: { accepted: true, spec_hash: `0x${'ab'.repeat(32)}`, price_usdc: PRICE_USDC },
  };
});
afterAll(() => api.server.close());

describe('hostedHireReturnsPaymentRequired', () => {
  it('screens, quotes from the 402, and sends no payment header', async () => {
    const harness = await connect({ mode: 'hosted' });
    try {
      const result = (await harness.client.callTool({
        name: 'hire_human',
        arguments: VERIFY_OPEN_ENVELOPE,
      })) as { structuredContent: Record<string, unknown>; isError?: boolean };

      expect(result.isError).not.toBe(true);

      const paths = api.seen.map((r) => `${r.method} ${new URL(r.url).pathname}`);
      expect(paths).toEqual(['POST /check', 'POST /tasks']);
      for (const request of api.seen) {
        expect(request.headerNames).not.toContain('payment-signature');
      }

      expect(result.structuredContent).toEqual({
        payment_required: true,
        endpoint: `${API_BASE}/tasks`,
        price_usdc: 3.45,
        network: 'eip155:84532',
        asset: 'USDC',
        pay_to: PAY_TO,
        install_line: INSTALL_LINE,
        dashboard_url: DASHBOARD_URL,
      });
      expect(result.structuredContent).not.toHaveProperty('task_id');
      expect(INSTALL_LINE).toBe('claude mcp add legwork -- npx @legwork/mcp');
    } finally {
      await harness.close();
    }
  });

  it('passes a refusal through untouched and never asks for a price', async () => {
    api.checkResponse = { status: 422, body: REFUSAL };

    const harness = await connect({ mode: 'hosted' });
    try {
      const result = (await harness.client.callTool({
        name: 'hire_human',
        arguments: VERIFY_OPEN_ENVELOPE,
      })) as { structuredContent: Record<string, unknown>; isError?: boolean };

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(REFUSAL);
      expect(result.structuredContent.message).toBe(NO_RETRY_SENTENCE);
      // A refused task moves no money: the post is never attempted.
      expect(api.seen.map((r) => new URL(r.url).pathname)).toEqual(['/check']);
    } finally {
      await harness.close();
    }
  });

  it('says so plainly when local hire is not wired in this build', async () => {
    const harness = await connect({ mode: 'local' });
    try {
      const result = (await harness.client.callTool({
        name: 'hire_human',
        arguments: VERIFY_OPEN_ENVELOPE,
      })) as { isError?: boolean; content: { text: string }[] };

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toBe('local hire_human is not wired in this build');
      expect(api.seen).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });
});
