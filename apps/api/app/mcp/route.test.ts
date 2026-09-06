/**
 * The mount answers JSON-RPC over plain HTTP, with the six tools on it.
 *
 * `maxDuration` is asserted alongside because it is the difference between a 50-second
 * `task_status` long-poll returning and the platform killing the function underneath it.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config';
import { DELETE, GET, POST, maxDuration } from './route';

// The handler is built on the first request and held, so the environment has to be in place
// before it. No subgraph URL here: the mount must come up without one.
beforeAll(() => {
  resetConfigForTests({
    API_BASE_URL: 'http://localhost:3001',
    DASHBOARD_URL: 'http://localhost:3000',
  });
});

const RPC_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

function rpc(body: unknown): Request {
  return new Request('http://localhost:3001/mcp', {
    method: 'POST',
    headers: RPC_HEADERS,
    body: JSON.stringify(body),
  });
}

/** Streamable HTTP may answer with an SSE frame; either way the payload is one JSON-RPC body. */
async function readRpc(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.startsWith('{')) return JSON.parse(text) as Record<string, unknown>;
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  return JSON.parse(line!.slice('data: '.length)) as Record<string, unknown>;
}

describe('mcpRouteListsTools', () => {
  it('serves initialize and tools/list with the six names', async () => {
    const initialized = await POST(
      rpc({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'judge', version: '0.0.0' },
        },
      }),
    );
    expect(initialized.status).toBe(200);

    const listed = await POST(rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }));
    expect(listed.status).toBe(200);

    const body = await readRpc(listed);
    const result = body.result as { tools: { name: string }[] };
    expect(result.tools.map((t) => t.name).sort()).toEqual([
      'approve_task',
      'check_task',
      'dispute_task',
      'hire_human',
      'preflight_workers',
      'task_status',
    ]);
  });

  it('stops before the platform does', () => {
    expect(maxDuration).toBe(60);
  });

  it('exports the three methods streamable HTTP needs', () => {
    expect(typeof GET).toBe('function');
    expect(typeof POST).toBe('function');
    expect(typeof DELETE).toBe('function');
  });
});
