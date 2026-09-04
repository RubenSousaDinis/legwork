import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ABUSE_CLASS_ID, TASK_TYPE_BIT } from '@legwork/shared';
import { createSubgraphClient } from '../src/client.js';
import { activeWorkers, marksByAgent, posterStats, recentTasks, task } from '../src/helpers.js';
import {
  MarkRowSchema,
  PosterStatsRowSchema,
  TaskRowSchema,
  WorkerRowSchema,
} from '../src/types.js';

const URL_ = 'https://api.example/subgraphs/id/legwork';

function fixture(name: string): unknown {
  const path = fileURLToPath(new URL(`../fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

interface Call {
  url: string;
  headers: Record<string, string>;
  body: { query: string; variables: Record<string, unknown> };
}

/**
 * A fetch that never opens a socket: it answers from the recorded fixtures and records
 * what it was asked for, so the tests can assert on the wire without a live subgraph.
 */
function stubFetch(responses: unknown[], calls: Call[]): typeof globalThis.fetch {
  let n = 0;
  return (async (input: unknown, init?: RequestInit) => {
    const headers = { ...((init?.headers as Record<string, string>) ?? {}) };
    calls.push({ url: String(input), headers, body: JSON.parse(String(init?.body)) });
    const payload = responses[Math.min(n, responses.length - 1)];
    n += 1;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
    } as Response;
  }) as unknown as typeof globalThis.fetch;
}

describe('queriesTyped', () => {
  it('queriesTyped', async () => {
    const calls: Call[] = [];

    // activeWorkers — two round trips: the workers, then the released tasks behind them.
    const workersClient = createSubgraphClient({
      url: URL_,
      fetch: stubFetch([fixture('activeWorkers'), fixture('releasedTasksByWorkers')], calls),
    });
    const source = await activeWorkers(workersClient, {
      taskTypeBit: TASK_TYPE_BIT['verify-open'],
      areaPrefix: 'ez1dp',
      sinceTs: 1788561600,
    });
    expect(source.workers).toHaveLength(4);
    for (const worker of source.workers) expect(WorkerRowSchema.parse(worker)).toBeTruthy();
    for (const row of source.tasks) expect(TaskRowSchema.parse(row)).toBeTruthy();
    // reset rows never come back, and the bitmask filter ran client-side.
    expect(source.workers.every((w) => !w.reset)).toBe(true);

    // task(id)
    const taskCalls: Call[] = [];
    const taskClient = createSubgraphClient({
      url: URL_,
      fetch: stubFetch([fixture('task')], taskCalls),
    });
    const one = await task(taskClient, '101');
    expect(one).not.toBeNull();
    expect(TaskRowSchema.parse(one)).toBeTruthy();
    expect(taskCalls[0]?.body.variables).toEqual({ id: '101' });

    // recentTasks(n)
    const recentCalls: Call[] = [];
    const recentClient = createSubgraphClient({
      url: URL_,
      fetch: stubFetch([fixture('recentTasks')], recentCalls),
    });
    const recent = await recentTasks(recentClient, 3);
    expect(recent).toHaveLength(3);
    for (const row of recent) expect(TaskRowSchema.parse(row)).toBeTruthy();
    expect(recentCalls[0]?.body.variables).toEqual({ first: 3 });

    // posterStats() — the operator is the only poster, so 0 is the honest reading.
    const statsClient = createSubgraphClient({
      url: URL_,
      fetch: stubFetch([fixture('posterStats')], []),
    });
    const stats = await posterStats(statsClient);
    expect(PosterStatsRowSchema.parse(stats)).toBeTruthy();
    expect(stats?.distinctExternalBuyers).toBe(0);
    expect(stats?.externalTasks).toBe(0);

    // marksByAgent — the one place a class id becomes a label, and it comes from the
    // shared enum rather than a local string.
    const markClient = createSubgraphClient({
      url: URL_,
      fetch: stubFetch([fixture('marksByAgent')], []),
    });
    const marks = await marksByAgent(markClient, '1207');
    expect(marks).toHaveLength(1);
    for (const mark of marks) expect(MarkRowSchema.parse(mark)).toBeTruthy();
    expect(marks[0]?.abuseClass).toBe('authentication circumvention');
    expect(ABUSE_CLASS_ID[marks[0]!.abuseClass]).toBe(marks[0]?.classId);
  });

  it('passes the document and variables through unchanged', async () => {
    const calls: Call[] = [];
    const client = createSubgraphClient({
      url: URL_,
      apiKey: 'gk-test',
      fetch: stubFetch([{ data: { ok: true } }], calls),
    });
    const document = 'query Whatever($a: Int!) { thing(a: $a) { id } }';
    const variables = { a: 1, nested: { b: [1, 2, 3] } };

    const data = await client.query<{ ok: boolean }>(document, variables);
    expect(data.ok).toBe(true);
    expect(calls[0]?.body.query).toBe(document);
    expect(calls[0]?.body.variables).toEqual(variables);
    expect(calls[0]?.url).toBe(URL_);
    expect(calls[0]?.headers.authorization).toBe('Bearer gk-test');
  });

  it('rejects a GraphQL errors body', async () => {
    const client = createSubgraphClient({
      url: URL_,
      fetch: stubFetch([{ errors: [{ message: 'store error: unknown field on Worker' }] }], []),
    });
    await expect(client.query('query { x }')).rejects.toThrow(/store error: unknown field on Worker/);
  });

  it('sends no Authorization header without an apiKey', async () => {
    const calls: Call[] = [];
    const client = createSubgraphClient({
      url: URL_,
      fetch: stubFetch([{ data: {} }], calls),
    });
    await client.query('query { x }');
    const headers = calls[0]?.headers ?? {};
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
  });
});
