/**
 * Every result carries somewhere a human can look.
 *
 * An agent that cannot show its principal the task is an agent whose word is the only evidence
 * — so the URL is not decoration, and the JSON-only content rule beside it is what keeps a
 * worker's note from ever travelling as prose.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MemoryTokenStore } from '../src/keychain';
import { AREA, NOW_SECONDS, TASK_TYPE, fakeStudio } from './fixtures/studio';
import { API_BASE, DASHBOARD_URL, VERIFY_OPEN_ENVELOPE, connect, mockApi } from './harness';

const api = mockApi();

beforeAll(() => api.server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  api.server.resetHandlers();
  api.seen.length = 0;
});
afterAll(() => api.server.close());

const CALLS = [
  { name: 'preflight_workers', arguments: { task_type: TASK_TYPE, area: AREA } },
  { name: 'check_task', arguments: { task_type: TASK_TYPE, spec: VERIFY_OPEN_ENVELOPE.spec } },
  { name: 'hire_human', arguments: VERIFY_OPEN_ENVELOPE },
  { name: 'task_status', arguments: { task_id: '7', wait_seconds: 0 } },
  { name: 'approve_task', arguments: { task_id: '7', buyer_token: 'abc' } },
  { name: 'dispute_task', arguments: { task_id: '7', reason: 'wrong door', buyer_token: 'abc' } },
] as const;

describe('everyResultCarriesDashboardUrl', () => {
  it('all six tools answer with a dashboard url and nothing but JSON', async () => {
    const harness = await connect({
      mode: 'hosted',
      apiBase: API_BASE,
      dashboardUrl: DASHBOARD_URL,
      subgraph: fakeStudio('A'),
      tokenStore: new MemoryTokenStore(),
    });

    try {
      for (const call of CALLS) {
        const result = (await harness.client.callTool({
          name: call.name,
          arguments: call.arguments as Record<string, unknown>,
        })) as {
          isError?: boolean;
          content: { type: string; text: string }[];
          structuredContent: Record<string, unknown>;
        };

        expect(result.isError, `${call.name} answered with an error`).not.toBe(true);
        expect(String(result.structuredContent.dashboard_url), call.name).toMatch(
          new RegExp(`^${DASHBOARD_URL}`),
        );
        expect(result.content, call.name).toHaveLength(1);
        expect(result.content[0]?.type, call.name).toBe('text');
        expect(result.content[0]?.text, call.name).toBe(JSON.stringify(result.structuredContent));
      }
    } finally {
      await harness.close();
    }
  });

  it('falls back to the API when local mode has no subgraph of its own', async () => {
    const harness = await connect({ mode: 'local', tokenStore: new MemoryTokenStore() });
    try {
      const result = (await harness.client.callTool({
        name: 'preflight_workers',
        arguments: { task_type: TASK_TYPE, area: AREA },
      })) as { structuredContent: Record<string, unknown> };

      expect(new URL(api.seen.at(-1)!.url).pathname).toBe('/public/preflight');
      expect(result.structuredContent.median_source).toBe('real');
      expect(result.structuredContent.dashboard_url).toBe(DASHBOARD_URL);
      expect(NOW_SECONDS).toBeGreaterThan(0);
    } finally {
      await harness.close();
    }
  });
});
