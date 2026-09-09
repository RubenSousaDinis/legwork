/**
 * A place_id the cached extract cannot locate must not become a task. Without a coordinate
 * the 150 m geofence, the 2 km claim radius and `distance_m` all go silent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hex } from 'viem';
import { FakeChain } from '@legwork/chain';
import {
  FakeFacilitator,
  REQUEST_HEADER,
  SqlIdempotencyStore,
  X402Gateway,
  signPaymentHeader,
  type PaymentGateway,
} from '@legwork/payments';
import { FakeClassifier, getPlaceIndex } from '@legwork/screening';
import { POST as check } from '../app/check/route';
import { route } from '../src/http/route';
import { resetConfigForTests } from '../src/config';
import { resetRateLimitForTests } from '../src/http/rateLimit';
import { tasks } from '../src/db/schema';
import { caps } from '../src/services/caps';
import { resetPosterCacheForTests } from '../src/services/posters';
import {
  hire,
  screenEnvelope,
  type HireDeps,
  type PostParams,
  type ScreenOutcome,
} from '../src/services/hire';
import { call } from './app';
import { createTestDb, type TestDb } from './db';

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
const PAY_TO = '0x1111111111111111111111111111111111111111' as const;
const RESOURCE = 'http://localhost/tasks';
const DASHBOARD_URL = 'https://dashboard.legwork.test';
const MISSING_PLACE_ID = 'node/1';

const UNRESOLVABLE = {
  task_type: 'verify-open',
  amount_usdc: 3.0,
  spec: {
    place: {
      place_id: MISSING_PLACE_ID,
      name: 'Farmácia Lis',
      street_address: 'Rua de Leiria 29',
      locality: 'Leiria',
      country: 'PT',
    },
    question: 'open_now',
    claimed_open: null,
    claimed_hours: null,
    source: 'osm',
  },
} as const;

interface Bench {
  db: TestDb;
  chain: FakeChain;
  facilitator: FakeFacilitator;
  posts: PostParams[];
  deps: HireDeps;
  screen: (body: unknown) => Promise<ScreenOutcome>;
}

let bench: Bench;

const realScreen = (body: unknown): Promise<ScreenOutcome> =>
  screenEnvelope(body, { places: getPlaceIndex(), classifier: new FakeClassifier() });

async function buildBench(): Promise<Bench> {
  const db = await createTestDb();
  const chain = new FakeChain();
  chain.mintUsdc(chain.relayerAddress, 1_000_000_000n);

  const facilitator = new FakeFacilitator();
  const gateway: PaymentGateway = new X402Gateway({
    facilitator,
    payTo: PAY_TO,
    asset: USDC,
    network: 'eip155:84532',
  });

  const posts: PostParams[] = [];
  const resolveAgentId = vi.fn(async () => ({ agentId: 0n, verified: false }));
  const markIfIdentified = vi.fn(async () => ({ marked: false }) as { marked: false });

  const partial: Omit<Bench, 'deps'> = {
    db,
    chain,
    facilitator,
    posts,
    screen: realScreen,
  };

  const deps: HireDeps = {
    gateway,
    idem: new SqlIdempotencyStore((text, params) => db.rawQuery(text, params)),
    db: db.db,
    chain: { allowlistedBuyer: (buyer: string) => chain.allowlistedBuyer(buyer as Hex) },
    txq: {
      post: async (p: PostParams) => {
        posts.push(p);
        const result = await chain.post({ ...p, buyer: p.buyer as Hex });
        return { taskId: result.taskId, hash: result.hash };
      },
    },
    screen: (body) => bench.screen(body),
    identity: { resolveAgentId: resolveAgentId as unknown as HireDeps['identity']['resolveAgentId'] },
    abuseMark: {
      markIfIdentified: markIfIdentified as unknown as HireDeps['abuseMark']['markIfIdentified'],
    },
    caps: caps(),
    clock: () => new Date(),
    log: { info: () => undefined, error: () => undefined, warn: () => undefined },
  };

  return { ...partial, deps };
}

const handler = route((req) => hire(req, bench.deps));

beforeEach(async () => {
  resetConfigForTests({ DASHBOARD_URL });
  resetRateLimitForTests();
  resetPosterCacheForTests();
  bench = await buildBench();
});

afterEach(async () => {
  await bench?.db.close();
  vi.restoreAllMocks();
});

describe('an unresolvable place', () => {
  it('unresolvablePlaceIsRefused', async () => {
    const checked = await call(check, {
      method: 'POST',
      url: 'http://localhost/check',
      body: UNRESOLVABLE,
    });
    expect(checked.status).toBe(400);
    const checkBody = (await checked.json()) as { error: string; field: string; reason: string };
    expect(checkBody.error).toBe('invalid_request');
    expect(checkBody.field).toBe('spec.place.place_id');
    expect(checkBody.reason).toContain(MISSING_PLACE_ID);

    const unpaid = await call(handler, { method: 'POST', url: RESOURCE, body: UNRESOLVABLE });
    const unpaidBody = (await unpaid.json()) as { accepts: Parameters<typeof signPaymentHeader>[0]['requirements'][] };
    const signed = await signPaymentHeader({ requirements: unpaidBody.accepts[0]! });
    const res = await call(handler, {
      method: 'POST',
      url: RESOURCE,
      headers: { [REQUEST_HEADER]: signed.header },
      body: UNRESOLVABLE,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field: string; reason: string };
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('spec.place.place_id');
    expect(body.reason).toContain(MISSING_PLACE_ID);

    expect(bench.posts).toHaveLength(0);
    expect(bench.facilitator.settleCalls).toBe(0);
    const all = await bench.db.db.select().from(tasks);
    expect(all).toHaveLength(0);
  });
});
