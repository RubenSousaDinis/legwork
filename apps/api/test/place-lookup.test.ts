/**
 * Live place-lookup fallback on /check and /tasks — every lookup is a fake; nothing dials Out.
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
import { FakeClassifier, getPlaceIndex, type LookupResult, type Poi } from '@legwork/screening';
import { POST as check } from '../app/check/route';
import { GET as publicTask } from '../app/public/task/[id]/route';
import { route } from '../src/http/route';
import { resetConfigForTests } from '../src/config';
import { resetRateLimitForTests } from '../src/http/rateLimit';
import { tasks } from '../src/db/schema';
import { caps } from '../src/services/caps';
import { resetPosterCacheForTests } from '../src/services/posters';
import {
  hire,
  resetLookupForTests,
  screenEnvelope,
  screenerDepsForTests,
  setScreenEnvelopeDepsForTests,
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

const COIMBRA = 'node/536546148';
const COIMBRA_STREET = 'Rua Ferreira Borges 120';

const COIMBRA_POI: Poi = {
  id: COIMBRA,
  name: 'Farmácia Adriana',
  tags: {
    amenity: 'pharmacy',
    name: 'Farmácia Adriana',
    'addr:street': COIMBRA_STREET,
  },
  addr: { street: COIMBRA_STREET },
  lat: 40.2104,
  lon: -8.4192,
};

const COIMBRA_ENVELOPE = {
  task_type: 'verify-open',
  amount_usdc: 3.0,
  spec: {
    place: {
      place_id: COIMBRA,
      name: 'Farmácia Adriana',
      street_address: COIMBRA_STREET,
      locality: 'Coimbra',
      country: 'PT',
    },
    question: 'open_now',
    claimed_open: null,
    claimed_hours: null,
    source: 'osm',
  },
} as const;

/** Farmácia Lis — packaged Leiria extract. */
const PACKAGED = {
  task_type: 'verify-open',
  amount_usdc: 3.0,
  spec: {
    place: {
      place_id: 'node/650194167',
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

const COMPARE_TWO = {
  task_type: 'compare-two',
  amount_usdc: 1.0,
  spec: {
    a: {
      kind: 'image',
      url: 'https://ex.pt/a.jpg',
      sha256: '1a1b2c3d4e5f6a7b1a1b2c3d4e5f6a7b1a1b2c3d4e5f6a7b1a1b2c3d4e5f6a7b',
    },
    b: {
      kind: 'image',
      url: 'https://ex.pt/b.jpg',
      sha256: '2a1b2c3d4e5f6a7b2a1b2c3d4e5f6a7b2a1b2c3d4e5f6a7b2a1b2c3d4e5f6a7b',
    },
    criterion_id: 'more_legible',
  },
} as const;

interface FakeLookup {
  calls: string[];
  impl: (placeId: string) => Promise<LookupResult>;
  fn: (placeId: string) => Promise<LookupResult>;
}

function makeFakeLookup(
  impl: (placeId: string) => Promise<LookupResult> = async () => ({ kind: 'not_found' }),
): FakeLookup {
  const calls: string[] = [];
  const fn = async (placeId: string): Promise<LookupResult> => {
    calls.push(placeId);
    return impl(placeId);
  };
  return { calls, impl, fn };
}

interface Bench {
  db: TestDb;
  chain: FakeChain;
  facilitator: FakeFacilitator;
  posts: PostParams[];
  deps: HireDeps;
  screen: (body: unknown) => Promise<ScreenOutcome>;
  lookup: FakeLookup;
}

let bench: Bench;

function bindLookup(lookup: FakeLookup): void {
  const deps = {
    places: getPlaceIndex(),
    classifier: new FakeClassifier(),
    lookup: lookup.fn,
  };
  setScreenEnvelopeDepsForTests(deps);
  bench.lookup = lookup;
  bench.screen = (body) => screenEnvelope(body, deps);
}

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
  const lookup = makeFakeLookup(async () => ({ kind: 'found', poi: COIMBRA_POI }));

  const partial: Omit<Bench, 'deps'> = {
    db,
    chain,
    facilitator,
    posts,
    screen: (body) =>
      screenEnvelope(body, {
        places: getPlaceIndex(),
        classifier: new FakeClassifier(),
        lookup: lookup.fn,
      }),
    lookup,
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

async function unpaid(body: unknown) {
  const res = await call(handler, { method: 'POST', url: RESOURCE, body });
  const json = (await res.json()) as {
    accepts: Parameters<typeof signPaymentHeader>[0]['requirements'][];
  };
  return { res, json };
}

async function paidWithHeader(body: unknown, header: string): Promise<Response> {
  return call(handler, {
    method: 'POST',
    url: RESOURCE,
    headers: { [REQUEST_HEADER]: header },
    body,
  });
}

async function paid(body: unknown) {
  const { json } = await unpaid(body);
  const signed = await signPaymentHeader({ requirements: json.accepts[0]! });
  const res = await paidWithHeader(body, signed.header);
  return { res, signed };
}

beforeEach(async () => {
  resetConfigForTests({ DASHBOARD_URL });
  resetRateLimitForTests();
  resetPosterCacheForTests();
  resetLookupForTests();
  bench = await buildBench();
  bindLookup(bench.lookup);
});

afterEach(async () => {
  resetLookupForTests();
  await bench?.db.close();
  vi.restoreAllMocks();
});

describe('place lookup fallback', () => {
  it('checkResolvesAPlaceOutsideThePackagedExtract', async () => {
    bindLookup(makeFakeLookup(async () => ({ kind: 'found', poi: COIMBRA_POI })));

    const res = await call(check, {
      method: 'POST',
      url: 'http://localhost/check',
      body: COIMBRA_ENVELOPE,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ accepted: true, price_usdc: 3.45 });
    expect(bench.lookup.calls).toEqual([COIMBRA]);
  });

  it('postTasksResolvesAPlaceOutsideThePackagedExtract', async () => {
    bindLookup(makeFakeLookup(async () => ({ kind: 'found', poi: COIMBRA_POI })));

    const { res } = await paid(COIMBRA_ENVELOPE);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { task_id: string };
    const [row] = await bench.db.db.select().from(tasks);
    expect(row?.area).toBe('ez4hb');
    expect(Number(row?.exactLat)).toBe(40.2104);
    expect(Number(row?.exactLon)).toBe(-8.4192);

    const pub = await call(publicTask, {
      url: `http://localhost/public/task/${body.task_id}`,
      params: { id: body.task_id },
    });
    expect(pub.status).toBe(200);
    const view = (await pub.json()) as {
      coordinate_rounded: { lat: number; lon: number };
      locality?: string;
      country?: string;
    };
    expect(view.coordinate_rounded).toEqual({ lat: 40.21, lon: -8.419 });
    expect(JSON.stringify(view)).not.toContain('40.2104');
    expect(JSON.stringify(view)).not.toContain('-8.4192');
  });

  it('checkIs400WhenTheLookupFindsNothing', async () => {
    bindLookup(makeFakeLookup(async () => ({ kind: 'not_found' })));

    const res = await call(check, {
      method: 'POST',
      url: 'http://localhost/check',
      body: COIMBRA_ENVELOPE,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field: string; reason: string };
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('spec.place.place_id');
    expect(body.reason).toContain('unresolvable place_id');
  });

  it('checkIs503WhenTheLookupIsUnavailable', async () => {
    bindLookup(makeFakeLookup(async () => ({ kind: 'unavailable' })));

    const res = await call(check, {
      method: 'POST',
      url: 'http://localhost/check',
      body: COIMBRA_ENVELOPE,
    });
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(await res.json()).toEqual({
      error: 'place_lookup_unavailable',
      retry_after_s: 30,
    });

    const logged = await bench.db.rawQuery(
      'SELECT class, marked, rule_id FROM screening_log ORDER BY at DESC LIMIT 1',
    );
    expect(logged[0]).toMatchObject({
      class: null,
      marked: false,
      rule_id: 'lookup.unavailable',
    });
  });

  it('postTasksIs503AndChargesNothingWhenTheLookupIsUnavailable', async () => {
    bindLookup(makeFakeLookup(async () => ({ kind: 'unavailable' })));

    const { json } = await unpaid(COIMBRA_ENVELOPE);
    const signed = await signPaymentHeader({ requirements: json.accepts[0]! });

    const first = await paidWithHeader(COIMBRA_ENVELOPE, signed.header);
    expect(first.status).toBe(503);
    expect(await first.json()).toEqual({
      error: 'place_lookup_unavailable',
      retry_after_s: 30,
    });
    expect(bench.posts).toHaveLength(0);
    expect(bench.facilitator.settleCalls).toBe(0);
    expect(await bench.db.db.select().from(tasks)).toHaveLength(0);

    const second = await paidWithHeader(COIMBRA_ENVELOPE, signed.header);
    expect(second.status).toBe(503);
    expect((await second.json() as { error: string }).error).toBe('place_lookup_unavailable');
    expect(second.status).not.toBe(409);
  });

  it('theLookupIsNotCalledForAPackagedId', async () => {
    const lookup = makeFakeLookup(async () => ({ kind: 'found', poi: COIMBRA_POI }));
    bindLookup(lookup);

    const res = await call(check, {
      method: 'POST',
      url: 'http://localhost/check',
      body: PACKAGED,
    });
    expect(res.status).toBe(200);
    expect(lookup.calls).toHaveLength(0);
  });

  it('theLookupIsNotCalledForCompareTwo', async () => {
    const lookup = makeFakeLookup(async () => ({ kind: 'found', poi: COIMBRA_POI }));
    bindLookup(lookup);

    const res = await call(check, {
      method: 'POST',
      url: 'http://localhost/check',
      body: COMPARE_TWO,
    });
    expect(res.status).toBe(200);
    expect(lookup.calls).toHaveLength(0);
  });

  it('theLookupIsNotCalledForAMalformedId', async () => {
    const lookup = makeFakeLookup(async () => ({ kind: 'found', poi: COIMBRA_POI }));
    bindLookup(lookup);

    const res = await call(check, {
      method: 'POST',
      url: 'http://localhost/check',
      body: {
        ...COIMBRA_ENVELOPE,
        spec: {
          ...COIMBRA_ENVELOPE.spec,
          place: { ...COIMBRA_ENVELOPE.spec.place, place_id: 'shop/12' },
        },
      },
    });
    expect(res.status).toBe(400);
    expect(lookup.calls).toHaveLength(0);
  });

  it('packagedModeNeverBuildsALookup', () => {
    resetLookupForTests();
    resetConfigForTests({ PLACE_LOOKUP: 'packaged', DASHBOARD_URL });
    const deps = screenerDepsForTests();
    expect(deps.lookup).toBeUndefined();
  });

  it('aResidentialLookedUpPlaceIsStillRefused', async () => {
    const residential: Poi = {
      id: COIMBRA,
      name: 'Farmácia Adriana',
      tags: { building: 'house', name: 'Farmácia Adriana' },
      addr: { street: COIMBRA_STREET },
      lat: 40.2104,
      lon: -8.4192,
    };
    bindLookup(makeFakeLookup(async () => ({ kind: 'found', poi: residential })));

    const res = await call(check, {
      method: 'POST',
      url: 'http://localhost/check',
      body: COIMBRA_ENVELOPE,
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { class: string; rule_id: string };
    expect(body.class).toBe('automated reconnaissance');
    expect(body.rule_id).toBe('place.residential');
  });

  it('aLookedUpPlaceWithoutAnInternationalPhoneCannotBeCalled', async () => {
    const noPhone: Poi = {
      ...COIMBRA_POI,
      tags: { amenity: 'pharmacy', name: 'Farmácia Adriana', 'addr:street': COIMBRA_STREET },
    };
    delete (noPhone as { phone?: string }).phone;
    bindLookup(makeFakeLookup(async () => ({ kind: 'found', poi: noPhone })));

    const res = await call(check, {
      method: 'POST',
      url: 'http://localhost/check',
      body: {
        task_type: 'call-confirm',
        amount_usdc: 2.0,
        spec: {
          place: {
            place_id: COIMBRA,
            name: 'Farmácia Adriana',
            street_address: COIMBRA_STREET,
            locality: 'Coimbra',
            country: 'PT',
          },
          phone: '+351239123456',
          template_id: 'have_item',
          slots: { item: 'aspirin' },
        },
      },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { field: string; reason: string };
    expect(body.field).toBe('spec.phone');
    expect(body.reason).toContain('place has no verified phone');
  });
});
