import { DemoData, poolString } from '@legwork/shared';
import demoJson from '../../../../demo-data.json';
import { subgraphClient } from './live';

/**
 * The pool headline the static pages print — `1 real · +23 seeded (demo data)`.
 *
 * `/live` reads the same numbers off the subgraph on every poll. The landing, `/about`,
 * `/support`, `/deck` and `/overview` used to carry the string as typed copy, so the front
 * door said `+20` while the board said `+23`. This is the one place the static pages ask.
 */

/** Parsed, not trusted: a malformed `demo-data.json` fails here rather than on a page. */
const demo = DemoData.parse(demoJson);

/** Two booleans per worker and nothing else — no address, no area, no count of anything. */
export const POOL_COUNT_QUERY = `
query PoolCounts($first: Int!) {
  workers(first: $first) {
    seeded
    reset
  }
}
`;

const PAGE = 500;
/** One answer per minute per server process; the count moves when a worker is seeded. */
const MEMO_MS = 60_000;

export interface PoolWorkerFlags {
  seeded: boolean;
  reset: boolean;
}

export interface PoolCounts {
  real: number;
  seeded: number;
}

/** The same arithmetic as the live mapper's pool card: a reset worker is counted nowhere. */
export function countPool(workers: readonly PoolWorkerFlags[]): PoolCounts {
  return {
    real: workers.filter((w) => !w.reset && !w.seeded).length,
    seeded: workers.filter((w) => w.seeded).length,
  };
}

/** What demo mode prints, byte for byte what `demo-data.json` says. */
export function demoPoolHeadline(): string {
  return poolString(demo.worker_pool.real, demo.worker_pool.seeded);
}

let memo: { at: number; text: string | null } | undefined;

/**
 * Demo mode answers from `demo-data.json`; live mode asks the subgraph. `null` means the
 * index could not answer — a page then prints no count rather than a stale or a demo one.
 */
export async function poolHeadline(
  mode: string | undefined = process.env.DATA_MODE,
): Promise<string | null> {
  if (mode !== 'live') return demoPoolHeadline();
  const now = Date.now();
  if (memo && now - memo.at < MEMO_MS) return memo.text;

  const client = subgraphClient();
  let text: string | null = null;
  if (client) {
    try {
      const body = await client.query<{ workers?: PoolWorkerFlags[] }>(POOL_COUNT_QUERY, {
        first: PAGE,
      });
      const { real, seeded } = countPool(body.workers ?? []);
      text = poolString(real, seeded);
    } catch {
      text = null;
    }
  }
  memo = { at: now, text };
  return text;
}

/** Vitest only. */
export function resetPoolHeadlineForTests(): void {
  memo = undefined;
}
