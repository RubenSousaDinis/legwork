/**
 * The buyer token is the whole of the authorisation on approve and dispute.
 *
 * Hosted mode never holds one, so the tool stops before the request rather than sending a call
 * it knows will be refused — and the answer names the local install line, which is the only
 * way an agent gets from "I cannot approve" to "I can".
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { INSTALL_LINE } from '@legwork/shared';
import { MemoryTokenStore } from '../src/keychain';
import { API_BASE, DASHBOARD_URL, connect, mockApi } from './harness';

const api = mockApi();

beforeAll(() => api.server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  api.server.resetHandlers();
  api.seen.length = 0;
});
afterAll(() => api.server.close());

describe('approveRequiresTokenInHostedMode', () => {
  it('stops before any request when hosted mode has no token', async () => {
    const harness = await connect({ mode: 'hosted' });
    try {
      const result = (await harness.client.callTool({
        name: 'approve_task',
        arguments: { task_id: '7' },
      })) as {
        isError?: boolean;
        content: { text: string }[];
        structuredContent: Record<string, unknown>;
      };

      expect(result.isError).toBe(true);
      expect(api.seen).toHaveLength(0);
      expect(result.content[0]?.text).toBe(
        `buyer_token required: pass the token hire_human returned, or install the local server: ${INSTALL_LINE}`,
      );
      expect(result.structuredContent.dashboard_url).toBe(`${DASHBOARD_URL}/task/7`);
    } finally {
      await harness.close();
    }
  });

  it('sends the stored token in local mode and returns the transaction', async () => {
    const harness = await connect({
      mode: 'local',
      apiBase: API_BASE,
      dashboardUrl: DASHBOARD_URL,
      tokenStore: new MemoryTokenStore({ '7': 'buyer-token-7' }),
    });
    try {
      const result = (await harness.client.callTool({
        name: 'approve_task',
        arguments: { task_id: '7' },
      })) as { isError?: boolean; structuredContent: Record<string, unknown> };

      expect(result.isError).not.toBe(true);
      expect(api.seen.at(-1)?.headers['x-buyer-token']).toBe('buyer-token-7');
      expect(result.structuredContent).toEqual({
        task_id: '7',
        status: 'released',
        tx: `0x${'ab'.repeat(32)}`,
        dashboard_url: `${DASHBOARD_URL}/task/7`,
      });
    } finally {
      await harness.close();
    }
  });

  it('accepts a token passed straight into the hosted tool', async () => {
    const harness = await connect({ mode: 'hosted' });
    try {
      const result = (await harness.client.callTool({
        name: 'dispute_task',
        arguments: { task_id: '7', reason: 'the photo is of a different door', buyer_token: 'abc' },
      })) as { isError?: boolean; structuredContent: Record<string, unknown> };

      expect(result.isError).not.toBe(true);
      expect(api.seen.at(-1)?.headers['x-buyer-token']).toBe('abc');
      expect(api.seen.at(-1)?.body).toEqual({ reason: 'the photo is of a different door' });
      expect(result.structuredContent.status).toBe('disputed');
    } finally {
      await harness.close();
    }
  });
});
