/**
 * `POST /tasks` and `POST /check`, end to end and entirely offline.
 *
 * The payment is real in every sense that matters here: a genuine EIP-3009 authorization
 * signed with Anvil account #0 (a published test vector), verified and settled by
 * `FakeFacilitator`, which answers from arithmetic. The escrow is `FakeChain`, the database is
 * pglite running the same migrations as Supabase, and the screening is the real pipeline over
 * the packaged OSM extract — no model, no chain, no RPC, no facilitator on the wire.
 *
 * The five named tests are the brief's §8, and each one is a claim the product makes out
 * loud: money moves only after the escrow exists, an agent can read its own budget, a task
 * over the cap costs nothing and brands nobody, a malformed first call brands nobody, and the
 * dry run is free in every direction.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { PaymentRequirements } from '@x402/core/types';
import { FakeChain } from '@legwork/chain';
import {
  ANVIL_ACCOUNT_0_PRIVATE_KEY,
  FakeFacilitator,
  REQUEST_HEADER,
  SqlIdempotencyStore,
  X402Gateway,
  signPaymentHeader,
  type PaymentContext,
  type PaymentGateway,
} from '@legwork/payments';
import { FakeClassifier, getPlaceIndex } from '@legwork/screening';
import { DAILY_CAP_USDC, NO_RETRY_SENTENCE, TASK_TYPE_BIT } from '@legwork/shared';
import { POST as check } from '../../app/check/route';
import { call } from '../../test/app';
import { createTestDb, type TestDb } from '../../test/db';
import { resetConfigForTests } from '../config';
import { resetRateLimitForTests } from '../http/rateLimit';
import { route } from '../http/route';
import { tasks } from '../db/schema';
import { caps } from './caps';
import {
  hire,
  screenEnvelope,
  type HireDeps,
  type PostParams,
  type ScreenOutcome,
} from './hire';

// ------------------------------------------------------------------ fixtures

/** Base Sepolia USDC — the x402 library's own default asset for `eip155:84532`. */
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
const PAY_TO = '0x1111111111111111111111111111111111111111' as const;
const RESOURCE = 'http://localhost/tasks';
const DASHBOARD_URL = 'https://dashboard.legwork.test';

/** The signer of every paid request below, and therefore the payer and the buyer. */
const PAYER = privateKeyToAccount(ANVIL_ACCOUNT_0_PRIVATE_KEY).address;

/**
 * Act 1 of the demo: is the pharmacy open right now. `node/650194167` is Farmácia Lis, a
 * real business in the packaged Leiria extract with a listed phone.
 */
const ACT_1 = {
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

/** A call-confirm that asks the worker to read back a code: `authentication circumvention`. */
const DENYLISTED_CALL = {
  task_type: 'call-confirm',
  amount_usdc: 2.0,
  spec: {
    place: {
      place_id: 'node/650194167',
      name: 'Farmácia Lis',
      street_address: 'Rua de Leiria 29',
      locality: 'Leiria',
      country: 'PT',
    },
    phone: '+351244882609',
    template_id: 'have_item',
    slots: { item: 'read me the code' },
  },
} as const;

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

// ------------------------------------------------------------------ the bench

/**
 * When each side of the frozen order actually happened. `hrtime` is monotonic, so
 * `settle > post` here is a real ordering claim and not a same-millisecond coincidence.
 */
class Timeline {
  readonly marks: { name: string; at: bigint }[] = [];

  mark(name: string): void {
    this.marks.push({ name, at: process.hrtime.bigint() });
  }

  at(name: string): bigint | undefined {
    return this.marks.find((m) => m.name === name)?.at;
  }

  get order(): string[] {
    return this.marks.map((m) => m.name);
  }
}

interface Bench {
  db: TestDb;
  chain: FakeChain;
  facilitator: FakeFacilitator;
  gateway: PaymentGateway;
  timeline: Timeline;
  posts: PostParams[];
  deps: HireDeps;
  resolveAgentId: ReturnType<typeof vi.fn>;
  markIfIdentified: ReturnType<typeof vi.fn>;
  logs: { info: object[]; error: object[] };
  /** Overridden by the two tests that want a verdict without running the pipeline. */
  screen: (body: unknown) => Promise<ScreenOutcome>;
}

let bench: Bench;

/** The real pipeline, over the packaged extract. The classifier is never reached from it. */
const realScreen = (body: unknown): Promise<ScreenOutcome> =>
  screenEnvelope(body, { places: getPlaceIndex(), classifier: new FakeClassifier() });

async function buildBench(): Promise<Bench> {
  const db = await createTestDb();
  const chain = new FakeChain();
  // The escrow is funded from the operator float: the relayer holds the USDC `post` pulls.
  chain.mintUsdc(chain.relayerAddress, 1_000_000_000n);

  const facilitator = new FakeFacilitator();
  const gateway = new X402Gateway({
    facilitator,
    payTo: PAY_TO,
    asset: USDC,
    network: 'eip155:84532',
  });

  const timeline = new Timeline();
  const posts: PostParams[] = [];
  const logs = { info: [] as object[], error: [] as object[] };

  const resolveAgentId = vi.fn(async () => ({ agentId: 0n, verified: false }));
  const markIfIdentified = vi.fn(async () => ({ marked: false }) as { marked: false });

  const partial: Omit<Bench, 'deps'> = {
    db,
    chain,
    facilitator,
    gateway: timedGateway(gateway, timeline),
    timeline,
    posts,
    resolveAgentId,
    markIfIdentified,
    logs,
    screen: realScreen,
  };

  const deps: HireDeps = {
    gateway: partial.gateway,
    // The SQL store, not the memory one: §8 asserts on the `idempotency` row itself.
    idem: new SqlIdempotencyStore((text, params) => db.rawQuery(text, params)),
    db: db.db,
    chain: { allowlistedBuyer: (buyer: string) => chain.allowlistedBuyer(buyer as Hex) },
    txq: {
      post: async (p: PostParams) => {
        posts.push(p);
        timeline.mark('post');
        const result = await chain.post({ ...p, buyer: p.buyer as Hex });
        return { taskId: result.taskId, hash: result.hash };
      },
    },
    // Read through the bench so a test can swap the verdict after the deps are built.
    screen: (body: unknown) => bench.screen(body),
    identity: { resolveAgentId: resolveAgentId as unknown as HireDeps['identity']['resolveAgentId'] },
    abuseMark: {
      markIfIdentified: markIfIdentified as unknown as HireDeps['abuseMark']['markIfIdentified'],
    },
    // The real caps service: every method reads `getDb()`, which `createTestDb()` installed.
    caps: caps(),
    clock: () => new Date(),
    log: {
      info: (o: object) => void logs.info.push(o),
      error: (o: object) => void logs.error.push(o),
      warn: () => undefined,
    },
  };

  return { ...partial, deps };
}

function timedGateway(inner: PaymentGateway, timeline: Timeline): PaymentGateway {
  return {
    price: (envelope) => inner.price(envelope),
    requirePayment: (req, quote, extras) => {
      timeline.mark('requirePayment');
      return inner.requirePayment(req, quote, extras);
    },
    settle: (ctx: PaymentContext) => {
      timeline.mark('settle');
      return inner.settle(ctx);
    },
    payerOf: (ctx) => inner.payerOf(ctx),
    authNonceOf: (ctx) => inner.authNonceOf(ctx),
  };
}

// ------------------------------------------------------------------- requests

/**
 * The route as Next mounts it, over the bench's deps: `hire()` throws `ApiError` for the two
 * codes the error envelope already owns, and `route()` is what turns those into a response.
 * Testing below the wrapper would test a handler no client ever reaches.
 */
const handler = route((req) => hire(req, bench.deps));

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return call(handler, { method: 'POST', url: RESOURCE, headers, body });
}

/** The 402 an unpaid request gets back, which is where a client reads its requirements. */
async function unpaid(body: unknown, headers: Record<string, string> = {}) {
  const res = await post(body, headers);
  const json = (await res.json()) as {
    error: string;
    price_usdc: number;
    accepts: PaymentRequirements[];
    remaining_budget: { open_tasks: number; daily_usdc: number };
  };
  return { res, json };
}

/** 402, sign, retry — what an x402 client does, with a nonce a replay test can pin. */
async function paid(body: unknown, nonce?: Hex) {
  const { json } = await unpaid(body);
  const requirements = json.accepts[0] as PaymentRequirements;
  const signed = await signPaymentHeader({ requirements, ...(nonce ? { nonce } : {}) });
  const res = await post(body, { [REQUEST_HEADER]: signed.header });
  return { res, signed };
}

/** A `tasks` row that already holds one of the payer's five slots. */
async function seedOpenTask(payer: string, index: number): Promise<void> {
  await bench.db.db.insert(tasks).values({
    taskId: BigInt(900 + index),
    taskType: TASK_TYPE_BIT['verify-open'],
    specHash: `0x${(index + 1).toString(16).padStart(64, '0')}` as Hex,
    amountUnits: 3_000_000n,
    feeUnits: 450_000n,
    buyer: payer,
    area: 'ez1dp',
    state: 'open',
    postedAt: new Date(),
    claimTtlS: 1800,
    submitTtlS: 3600,
    disputeWindowS: 86_400,
    specJson: {},
    buyerTokenHash: sha256(`seed-${index}`),
    payer,
    priceUnits: 3_450_000n,
  });
}

beforeEach(async () => {
  resetConfigForTests({ DASHBOARD_URL });
  resetRateLimitForTests();
  bench = await buildBench();
});

afterEach(async () => {
  await bench?.db.close();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------- tests

describe('POST /tasks', () => {
  it('settleAfterPost', async () => {
    const { res, signed } = await paid(ACT_1);

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'buyer_token',
      'dashboard_url',
      'eta_seconds',
      'poll_after_seconds',
      'price_usdc',
      'spec_hash',
      'status',
      'task_id',
    ]);
    expect(body.status).toBe('open');
    expect(body.price_usdc).toBe(3.45);
    expect(body.dashboard_url).toBe(`${DASHBOARD_URL}/task/${String(body.task_id)}`);

    // One verify, one settle, and the settle happened after the escrow existed.
    expect(bench.facilitator.verifyCalls).toBe(1);
    expect(bench.facilitator.settleCalls).toBe(1);
    const postAt = bench.timeline.at('post');
    const settleAt = bench.timeline.at('settle');
    expect(postAt).toBeDefined();
    expect(settleAt).toBeDefined();
    expect(settleAt as bigint).toBeGreaterThan(postAt as bigint);
    expect(bench.timeline.order).toEqual(['requirePayment', 'requirePayment', 'post', 'settle']);

    const rows = await bench.db.db
      .select()
      .from(tasks)
      .where(eq(tasks.taskId, BigInt(String(body.task_id))));
    const row = rows[0];
    expect(row).toBeDefined();
    expect(row?.payer.toLowerCase()).toBe(PAYER.toLowerCase());
    expect(row?.authNonce).toBe(signed.nonce);
    expect(row?.priceUnits).toBe(3_450_000n);
    expect(row?.buyerTokenHash).toBe(sha256(String(body.buyer_token)));
    expect(row?.floatAbsorbed).toBe(false);
    // The private coordinate is stored; the public `area` is the 5-character cell.
    expect(row?.area).toBe('ez1dp');
    expect(Number(row?.exactLat)).toBeCloseTo(39.7622509, 5);

    const idem = await bench.db.rawQuery('SELECT task_id, settle_tx FROM idempotency WHERE auth_nonce = $1', [signed.nonce]);
    expect(idem).toHaveLength(1);
    expect(Number(idem[0]?.task_id)).toBe(Number(body.task_id));
    expect(idem[0]?.settle_tx).toBeTruthy();

    // The escrow was posted for the payer, and for the 3.00 the worker keeps.
    expect(bench.posts).toHaveLength(1);
    expect(bench.posts[0]?.buyer.toLowerCase()).toBe(PAYER.toLowerCase());
    expect(bench.posts[0]?.amount).toBe(3_000_000n);
    expect(bench.posts[0]?.buyerAgentId).toBe(0n);

    // ---- a post that fails never settles, and hands the authorization back ----
    const settlesBefore = bench.facilitator.settleCalls;
    const freshNonce = `0x${'ab'.repeat(32)}` as Hex;
    bench.chain.failNextWith('EnforcedPause');

    const failed = await paid(ACT_1, freshNonce);
    expect(failed.res.status).toBe(503);
    expect(await failed.res.json()).toEqual({ error: 'escrow_post_failed' });
    expect(bench.facilitator.settleCalls).toBe(settlesBefore);

    const store = new SqlIdempotencyStore((text, params) => bench.db.rawQuery(text, params));
    expect(await store.reserve(freshNonce)).toEqual({ state: 'reserved' });
  });

  it('capsEchoedIn402', async () => {
    for (let i = 0; i < 5; i++) await seedOpenTask(PAYER, i);

    // The header is unauthenticated and informational: it buys an honest budget echo.
    const withHint = await unpaid(ACT_1, { 'x-payer': PAYER });
    expect(withHint.res.status).toBe(402);
    expect(withHint.json.error).toBe('payment_required');
    expect(withHint.json.price_usdc).toBe(3.45);
    expect(withHint.json.remaining_budget.open_tasks).toBe(0);

    // No hint, nothing known: the full budget, never someone else's.
    const anonymous = await unpaid(ACT_1);
    expect(anonymous.json.remaining_budget).toEqual({ open_tasks: 5, daily_usdc: DAILY_CAP_USDC });

    const { res } = await paid(ACT_1);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: 'cap_exceeded',
      open_tasks: 0,
      daily_usdc: DAILY_CAP_USDC,
    });
    expect(bench.facilitator.settleCalls).toBe(0);
    expect(bench.posts).toHaveLength(0);
    expect(bench.chain.calls.filter((c) => c.fn === 'post')).toHaveLength(0);
  });

  it('sixthOpenTaskRefusedNoMark', async () => {
    for (let i = 0; i < 5; i++) await seedOpenTask(PAYER, i);
    bench.resolveAgentId.mockResolvedValue({ agentId: 1207n, verified: true });

    const { res, signed } = await paid(ACT_1);
    expect(res.status).toBe(429);

    // A cap is not an abuse class. Nothing is marked, and nothing is written that says it was.
    expect(bench.markIfIdentified).not.toHaveBeenCalled();
    const marked = await bench.db.rawQuery('SELECT id FROM screening_log WHERE marked = true');
    expect(marked).toHaveLength(0);

    // The authorization was handed back: the agent can spend it once a slot frees up.
    const rows = await bench.db.rawQuery('SELECT auth_nonce FROM idempotency WHERE auth_nonce = $1', [signed.nonce]);
    expect(rows).toHaveLength(0);
  });

  it('schemaErrorNoMark', async () => {
    // 1.50 for a verify-open is below the 3.00 floor: a schema failure, not a refusal.
    const { res, signed } = await paid({ ...ACT_1, amount_usdc: 1.5 });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field: string; reason: string };
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('amount_usdc');
    expect(body.reason).toBeTruthy();

    // An evangelist's first malformed call must not brand their agent.
    expect(bench.markIfIdentified).not.toHaveBeenCalled();
    expect(bench.posts).toHaveLength(0);
    expect(bench.facilitator.settleCalls).toBe(0);

    const rows = await bench.db.rawQuery('SELECT auth_nonce FROM idempotency WHERE auth_nonce = $1', [signed.nonce]);
    expect(rows).toHaveLength(0);

    // The decision is on the record, with the field and the hash and none of the words.
    const logged = await bench.db.rawQuery('SELECT class, rule_id, marked FROM screening_log');
    expect(logged).toHaveLength(1);
    expect(logged[0]?.class).toBeNull();
    expect(logged[0]?.marked).toBe(false);
  });
});

describe('POST /check', () => {
  it('checkNeverPostsNeverMarks', async () => {
    const accepted = await call(check, { method: 'POST', url: 'http://localhost/check', body: ACT_1 });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({
      accepted: true,
      spec_hash: expect.stringMatching(/^0x[0-9a-f]{64}$/),
      price_usdc: 3.45,
    });

    const refused = await call(check, {
      method: 'POST',
      url: 'http://localhost/check',
      body: DENYLISTED_CALL,
    });
    expect(refused.status).toBe(422);
    const payload = (await refused.json()) as Record<string, unknown>;
    expect(payload.refused).toBe(true);
    expect(payload.retryable).toBe(false);
    expect(payload.class).toBe('authentication circumvention');
    expect(payload.message).toBe(NO_RETRY_SENTENCE);
    expect(payload).not.toHaveProperty('mark_tx');

    // Free in every direction: no chain write, no facilitator, no mark, no charge.
    expect(bench.chain.calls).toHaveLength(0);
    expect(bench.facilitator.verifyCalls).toBe(0);
    expect(bench.facilitator.settleCalls).toBe(0);
    expect(bench.resolveAgentId).not.toHaveBeenCalled();
    expect(bench.markIfIdentified).not.toHaveBeenCalled();
    const marked = await bench.db.rawQuery('SELECT id, payer FROM screening_log WHERE marked = true');
    expect(marked).toHaveLength(0);

    // The guarantee is structural, so it is asserted structurally: the route imports none of
    // the four modules that could post, charge, resolve an identity or mark one.
    const source = readFileSync(
      fileURLToPath(new URL('../../app/check/route.ts', import.meta.url)),
      'utf8',
    );
    const imports = source.split('\n').filter((line) => line.startsWith('import '));
    expect(imports.join('\n')).not.toMatch(/chain|identity|abuseMark|selectGateway|txq/);

    // The 31st call in a minute is the brake, not the screening.
    resetRateLimitForTests();
    for (let i = 0; i < 30; i++) {
      const res = await call(check, { method: 'POST', url: 'http://localhost/check', body: {} });
      expect(res.status).toBe(400);
    }
    const limited = await call(check, { method: 'POST', url: 'http://localhost/check', body: {} });
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toBe('rate_limited');
  });
});
