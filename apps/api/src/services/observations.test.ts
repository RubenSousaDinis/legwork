/**
 * T-40 §8, by name: `confidenceRule`, `seededExcludedFromAggregates`, `verifyOpenDelta`,
 * `publicObservationShape`.
 *
 * The first three are pure — `confidenceFor`, `buildObservation` and `listingDelta` take rows
 * and return records, so the v0 confidence rule can be argued with here rather than inferred
 * from a route's output. The last two also drive the real handler over pglite and `FakeChain`,
 * and `publicObservationShape` hunts the raw JSON text for sentinels planted in the private
 * columns: a field-by-field assertion passes on a body that also carries `worker_nullifier` in
 * a corner, and the nullifier is the one thing this surface must never publish.
 *
 * Fixture geography is Leiria, 39.7436 / -8.8071, with a capture 80 m away and one 400 m away
 * — both measured with the same haversine the geofence uses, so the distances in the brief are
 * asserted rather than trusted.
 */
import { FakeChain } from '@legwork/chain';
import {
  CALL_CONFIRM_TEMPLATES,
  GEOFENCE_M,
  Observation as ObservationSchema,
  TASK_TYPE_BIT,
  type CallTemplateId,
  type Observation,
  type TaskType,
} from '@legwork/shared';
import type { Address, Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as observationsRoute } from '../../app/public/observations/route';
import { call } from '../../test/app';
import { createTestDb, type TestDb } from '../../test/db';
import { setChainForTests } from '../chain';
import { resetConfigForTests } from '../config';
import { resetRateLimitForTests } from '../http/rateLimit';
import { adminAudit, observations, proofs, tasks } from '../db/schema';
import { distanceM } from './geo';
import type { TaskRow } from './lifecycle';
import {
  buildObservation,
  confidenceFor,
  listingDelta,
  recordObservation,
  resetWorkerCacheForTests,
  syncObservations,
  type ListingSpec,
  type ObservationInput,
  type ProofRow,
} from './observations';

const AREA = 'ez5ku';
const PLACE_LAT = 39.7436;
const PLACE_LON = -8.8071;
const WORKER = `0x${'c1'.repeat(20)}` as Address;
const SEEDED_WORKER = `0x${'5e'.repeat(20)}` as Address;
const NULLIFIER = 0x2a2an;
const NULLIFIER_HEX = '0x2a2a' as Hex;

const SENTINEL_SPEC = 'SENTINEL-SPEC-7f3a';
const SENTINEL_NOTE = 'SENTINEL-NOTE-91bc';
const SENTINEL_TOKEN = 'SENTINEL-TOKEN-4dd0';
const PAYER = `0x${'a1'.repeat(20)}`;
const AGENT_ID = '8004-1207';

const hashOf = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}`;

/** One degree of latitude in metres, near enough at this latitude to place a fixture. */
const M_PER_DEGREE_LAT = 111_320;
const northOf = (metres: number): number => PLACE_LAT + metres / M_PER_DEGREE_LAT;

const PLACE = {
  place_id: 'node/2734018563',
  name: 'Farmácia Central',
  street_address: 'Rua Direita 12',
  locality: 'Leiria',
  country: 'PT',
} as const;

const CLAIMED_AT = new Date('2026-09-12T14:00:00.000Z');
const SUBMITTED_AT = new Date('2026-09-12T14:40:00.000Z');
const CAPTURED_AT = new Date('2026-09-12T14:32:10.000Z');
const RELEASED_AT = new Date('2026-09-12T15:00:00.000Z');

interface TaskOverrides {
  task_type?: TaskType;
  state?: string;
  taskId?: bigint;
  answer?: string | null;
  seeded?: boolean;
  spec?: Record<string, unknown>;
  claimedAt?: Date | null;
  submittedAt?: Date | null;
  proofHash?: Hex | null;
  txRelease?: string | null;
  submitTtlS?: number;
}

/** A `verify-open` spec carrying every field a public surface must never repeat. */
function verifyOpenSpec(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    place: PLACE,
    question: 'open_now',
    claimed_open: true,
    claimed_hours: SENTINEL_SPEC,
    source: 'google',
    ...over,
  };
}

const SPEC_BY_TYPE: Record<TaskType, Record<string, unknown>> = {
  'verify-open': verifyOpenSpec(),
  'photo-of': { place: PLACE, subject: 'storefront', claimed_state: SENTINEL_SPEC, source: 'osm' },
  'call-confirm': {
    place: PLACE,
    phone: '+351244000000',
    template_id: 'have_item',
    slots: { item: 'pastilhas' },
  },
  'compare-two': {
    a: { kind: 'text', text: 'Rua Direita 12', sha256: 'a'.repeat(64) },
    b: { kind: 'text', text: 'Rua Direita 21', sha256: 'b'.repeat(64) },
    criterion_id: 'more_legible',
  },
};

const DEFAULT_ANSWER: Record<TaskType, string> = {
  'verify-open': 'closed',
  'photo-of': 'captured',
  'call-confirm': 'yes',
  'compare-two': 'a',
};

function mkTask(over: TaskOverrides = {}): TaskRow {
  const type = over.task_type ?? 'verify-open';
  const taskId = over.taskId ?? 1n;
  return {
    taskId,
    taskType: TASK_TYPE_BIT[type],
    specHash: hashOf(7),
    amountUnits: 3_000_000n,
    feeUnits: 450_000n,
    buyer: `0x${'b1'.repeat(20)}`,
    buyerAgentId: AGENT_ID,
    area: AREA,
    worker: WORKER,
    state: over.state ?? 'released',
    postedAt: new Date(CLAIMED_AT.getTime() - 600_000),
    claimedAt: over.claimedAt === undefined ? CLAIMED_AT : over.claimedAt,
    submittedAt: over.submittedAt === undefined ? SUBMITTED_AT : over.submittedAt,
    releasedAt: RELEASED_AT,
    proofHash: over.proofHash === undefined ? hashOf(11) : over.proofHash,
    claimTtlS: 1800,
    submitTtlS: over.submitTtlS ?? 3600,
    disputeWindowS: 120,
    seeded: over.seeded ?? false,
    answer: over.answer === undefined ? DEFAULT_ANSWER[type] : over.answer,
    note: SENTINEL_NOTE,
    disputeReason: null,
    autoDisputeReason: null,
    txPost: hashOf(1),
    txClaim: hashOf(2),
    txSubmit: hashOf(3),
    txRelease: over.txRelease === undefined ? hashOf(4) : over.txRelease,
    specJson: over.spec ?? SPEC_BY_TYPE[type],
    buyerTokenHash: SENTINEL_TOKEN,
    exactLat: String(PLACE_LAT),
    exactLon: String(PLACE_LON),
    agentId: AGENT_ID,
    payer: PAYER,
    authNonce: null,
    priceUnits: 3_450_000n,
    floatAbsorbed: false,
    updatedAt: RELEASED_AT,
  };
}

interface ProofOverrides {
  hash?: Hex;
  metresAway?: number;
  accuracyM?: string | null;
  gpsUnavailable?: boolean;
  capturedAt?: Date;
  taskId?: bigint;
}

function mkProof(over: ProofOverrides = {}): ProofRow {
  const away = over.metresAway ?? 80;
  const noGps = over.gpsUnavailable ?? false;
  return {
    hash: over.hash ?? hashOf(11),
    storageKey: 'proofs/original/11',
    capturedAt: over.capturedAt ?? CAPTURED_AT,
    exactLat: noGps ? null : String(northOf(away)),
    exactLon: noGps ? null : String(PLACE_LON),
    exactAccuracyM: noGps ? null : (over.accuracyM === undefined ? '25' : over.accuracyM),
    gpsUnavailable: noGps,
    worker: WORKER,
    taskId: over.taskId ?? 1n,
    placeId: PLACE.place_id,
  };
}

function input(over: Partial<ObservationInput> & { task?: TaskRow; proof?: ProofRow | null } = {}): ObservationInput {
  return {
    task: over.task ?? mkTask(),
    proof: over.proof === undefined ? mkProof() : over.proof,
    workerSeeded: over.workerSeeded ?? false,
    workerNullifier: over.workerNullifier ?? NULLIFIER_HEX,
    ...(over.resolvedToBuyer === undefined ? {} : { resolvedToBuyer: over.resolvedToBuyer }),
  };
}

// ---------------------------------------------------------------- confidenceRule

describe('confidenceRule', () => {
  it('grants 0.9 only to a verified human, photographed, inside the fence and inside the TTLs', () => {
    // The fixture distances the brief names, measured rather than assumed.
    expect(distanceM({ lat: northOf(80), lon: PLACE_LON }, { lat: PLACE_LAT, lon: PLACE_LON }))
      .toBeCloseTo(80, 0);
    expect(distanceM({ lat: northOf(400), lon: PLACE_LON }, { lat: PLACE_LAT, lon: PLACE_LON }))
      .toBeCloseTo(400, 0);
    expect(GEOFENCE_M).toBe(150);

    const record = buildObservation(input());
    expect(record?.confidence).toBe(0.9);
    expect(confidenceFor(input())).toBe(0.9);
    expect(record).toMatchObject({
      observation_id: 'obs-1',
      place_key: PLACE.place_id,
      claim: { type: 'open_now', value: 'closed' },
      evidence_hash: hashOf(11),
      observed_at: CAPTURED_AT.toISOString(),
      seeded: false,
    });
  });

  it('downgrades to 0.6 for no fix, outside the fence, a wide accuracy or a capture outside the window', () => {
    const gpsUnavailable = input({ proof: mkProof({ gpsUnavailable: true }) });
    expect(confidenceFor(gpsUnavailable)).toBe(0.6);

    const farAway = input({ proof: mkProof({ metresAway: 400 }) });
    expect(confidenceFor(farAway)).toBe(0.6);

    const wideAccuracy = input({ proof: mkProof({ accuracyM: '300' }) });
    expect(confidenceFor(wideAccuracy)).toBe(0.6);

    const tooEarly = input({
      proof: mkProof({ capturedAt: new Date(CLAIMED_AT.getTime() - 600_000) }),
    });
    expect(confidenceFor(tooEarly)).toBe(0.6);

    // Still released, still a record — accepted and labelled, never dressed up as 0.9.
    for (const downgraded of [gpsUnavailable, farAway, wideAccuracy, tooEarly]) {
      expect(buildObservation(downgraded)?.confidence).toBe(0.6);
    }
  });

  it('records a call-confirm at 0.5 with no evidence hash, one claim type per template', () => {
    const templates = Object.keys(CALL_CONFIRM_TEMPLATES) as CallTemplateId[];
    expect(templates).toHaveLength(6);

    const expected: Record<CallTemplateId, string> = {
      open_now: 'open_now',
      have_item: 'item_in_stock',
      price_of: 'price',
      accepts_payment: 'payment',
      closes_at_today: 'hours',
      takes_reservation: 'reservation',
    };

    for (const templateId of templates) {
      const task = mkTask({
        task_type: 'call-confirm',
        spec: { ...SPEC_BY_TYPE['call-confirm'], template_id: templateId },
        answer: 'yes',
      });
      const record = buildObservation(input({ task, proof: null }));
      expect(record?.confidence).toBe(0.5);
      expect(record?.evidence_hash).toBeNull();
      expect(record?.claim.type).toBe(expected[templateId]);
      // No `called_at` column exists, so the submit's timestamp stands in.
      expect(record?.observed_at).toBe(SUBMITTED_AT.toISOString());
    }
  });

  it('returns null for compare-two, for a refund and for a dispute resolved to the buyer', () => {
    expect(buildObservation(input({ task: mkTask({ task_type: 'compare-two' }), proof: null }))).toBeNull();
    expect(buildObservation(input({ task: mkTask({ state: 'refunded' }) }))).toBeNull();
    expect(buildObservation(input({ task: mkTask({ state: 'disputed' }) }))).toBeNull();
    expect(buildObservation(input({ task: mkTask({ state: 'submitted' }) }))).toBeNull();
    expect(
      buildObservation(input({ task: mkTask({ state: 'resolved' }), resolvedToBuyer: true })),
    ).toBeNull();
    expect(
      buildObservation(input({ task: mkTask({ state: 'resolved' }), resolvedToBuyer: false })),
    ).not.toBeNull();
  });

  it('writes a seeded row at confidence 0 and labels it', () => {
    const byWorker = buildObservation(input({ workerSeeded: true }));
    expect(byWorker).toMatchObject({ confidence: 0, seeded: true });

    const byTask = buildObservation(input({ task: mkTask({ seeded: true }) }));
    expect(byTask).toMatchObject({ confidence: 0, seeded: true });
  });

  it('parses every record it builds with the frozen Observation schema, keyed obs-<task_id>', () => {
    const records = [
      buildObservation(input()),
      buildObservation(input({ proof: mkProof({ gpsUnavailable: true }) })),
      buildObservation(input({ task: mkTask({ task_type: 'call-confirm' }), proof: null })),
      buildObservation(input({ task: mkTask({ task_type: 'photo-of' }) })),
      buildObservation(input({ workerSeeded: true })),
      buildObservation(input({ task: mkTask({ taskId: 99n }) })),
    ];

    for (const record of records) {
      expect(record).not.toBeNull();
      expect(() => ObservationSchema.parse(record)).not.toThrow();
      expect(record?.observation_id).toBe(`obs-${record?.task_id}`);
      expect([0, 0.5, 0.6, 0.9]).toContain(record?.confidence);
      // The worker's note is the buyer's to read and never a claim value.
      expect(record?.claim.value).not.toBe(SENTINEL_NOTE);
    }
    expect(records.at(-1)?.observation_id).toBe('obs-99');
  });
});

// ---------------------------------------------------------------- delta fixtures

let nextObservation = 0;

function mkObservation(over: Partial<Observation> & { place?: string } = {}): Observation {
  nextObservation += 1;
  const taskId = over.task_id ?? String(nextObservation);
  return ObservationSchema.parse({
    observation_id: `obs-${taskId}`,
    place_key: over.place ?? over.place_key ?? `node/${1000 + nextObservation}`,
    claim: over.claim ?? { type: 'open_now', value: 'closed' },
    evidence_hash: over.evidence_hash ?? hashOf(nextObservation),
    worker_nullifier: NULLIFIER_HEX,
    observed_at: over.observed_at ?? new Date(RELEASED_AT.getTime() + nextObservation * 1000).toISOString(),
    confidence: over.confidence ?? (over.seeded ? 0 : 0.9),
    task_id: taskId,
    seeded: over.seeded ?? false,
  });
}

const listing = (over: Partial<ListingSpec> = {}): ListingSpec => ({
  claimed_open: true,
  claimed_hours: SENTINEL_SPEC,
  source: 'google',
  ...over,
});

beforeEach(() => {
  nextObservation = 0;
});

// ---------------------------------------------------------------- verifyOpenDelta

describe('verifyOpenDelta', () => {
  it('counts neither a listing with no claim nor an answer that saw nothing', () => {
    const noClaim = mkObservation({ task_id: '1' });
    const unclear = mkObservation({ task_id: '2', claim: { type: 'open_now', value: 'unclear' } });
    const counted = mkObservation({ task_id: '3' });

    const delta = listingDelta([noClaim, unclear, counted], new Map([
      ['1', listing({ claimed_open: null })],
      ['2', listing()],
      ['3', listing()],
    ]));

    expect(delta.checked_places).toBe(1);
    expect(delta.wrong_listings).toBe(1);
  });

  it('uses the latest observation of a place, and counts a false claim answered open as wrong', () => {
    const place = 'node/2734018563';
    const earlier = mkObservation({
      task_id: '1',
      place,
      claim: { type: 'open_now', value: 'closed' },
      observed_at: '2026-09-12T09:00:00.000Z',
    });
    const later = mkObservation({
      task_id: '2',
      place,
      claim: { type: 'open_now', value: 'open' },
      observed_at: '2026-09-12T17:00:00.000Z',
    });

    const claimedOpen = listingDelta([earlier, later], new Map([
      ['1', listing({ claimed_open: true })],
      ['2', listing({ claimed_open: true })],
    ]));
    // The later reading agrees with the listing, so the place is checked and not wrong.
    expect(claimedOpen).toMatchObject({ checked_places: 1, wrong_listings: 0 });

    const claimedClosed = listingDelta([earlier, later], new Map([
      ['1', listing({ claimed_open: false })],
      ['2', listing({ claimed_open: false })],
    ]));
    expect(claimedClosed).toMatchObject({ checked_places: 1, wrong_listings: 1 });
  });

  it('never lets a photo-of or a call-confirm observation into the delta', () => {
    const photo = mkObservation({ task_id: '1', claim: { type: 'photo', value: 'captured' } });
    const called = mkObservation({ task_id: '2', claim: { type: 'item_in_stock', value: 'no' } });
    // A call-confirm answering `open_now` is still not a verify-open: it has no listing spec.
    const calledOpenNow = mkObservation({ task_id: '3', claim: { type: 'open_now', value: 'closed' } });

    const delta = listingDelta([photo, called, calledOpenNow], new Map([['1', listing()], ['2', listing()]]));
    expect(delta).toMatchObject({
      checked_places: 0,
      wrong_listings: 0,
      sentence: 'we checked 0 places; the listing was wrong about 0',
    });
  });
});

// ---------------------------------------------------------------- over pglite and FakeChain

let fixture: TestDb;
let fake: FakeChain;

async function insertTask(row: TaskRow): Promise<void> {
  await fixture.db.insert(tasks).values(row);
}

async function insertProof(row: ProofRow): Promise<void> {
  await fixture.db.insert(proofs).values(row);
}

/** One released `verify-open` task with its photo, at its own place. */
async function seedCompleted(
  n: number,
  answer: string,
  options: { worker?: Address; seededTask?: boolean; source?: string } = {},
): Promise<bigint> {
  const taskId = BigInt(n);
  const hash = hashOf(1000 + n);
  const task = mkTask({
    taskId,
    answer,
    proofHash: hash,
    spec: verifyOpenSpec({
      place: { ...PLACE, place_id: `node/${2734018560 + n}` },
      source: options.source ?? 'google',
    }),
    ...(options.seededTask === undefined ? {} : { seeded: options.seededTask }),
  });
  await insertTask({ ...task, worker: options.worker ?? WORKER });
  await insertProof(mkProof({ hash, taskId }));
  return taskId;
}

/**
 * The row T-17's submit route writes the moment a proof is handed in: same key, its own
 * confidence, before the dispute window has run. The fixture this task has to survive.
 */
async function insertSubmitTimeRow(
  taskId: bigint,
  placeKey: string,
  over: { confidence?: string; evidenceHash?: Hex } = {},
): Promise<void> {
  await fixture.db.insert(observations).values({
    observationId: `obs-${taskId}`,
    placeKey,
    claimType: 'open_now',
    claimValue: 'closed',
    evidenceHash: over.evidenceHash ?? null,
    workerNullifier: NULLIFIER_HEX,
    observedAt: CAPTURED_AT,
    confidence: over.confidence ?? '0.9',
    taskId,
    seeded: false,
    geohash5: AREA,
  });
}

async function body(url: string): Promise<{ res: Response; text: string; json: Record<string, unknown> }> {
  const res = await call(observationsRoute, { url });
  const text = await res.text();
  return { res, text, json: text ? JSON.parse(text) : {} };
}

beforeEach(async () => {
  resetConfigForTests();
  resetRateLimitForTests();
  resetWorkerCacheForTests();
  fake = new FakeChain();
  fake.setWorker(WORKER, { nullifier: NULLIFIER, seeded: false, area: AREA, taskTypes: 15 });
  fake.setWorker(SEEDED_WORKER, { nullifier: 0x5e5en, seeded: true, area: AREA, taskTypes: 15 });
  setChainForTests(fake);
  fixture = await createTestDb();
});

afterEach(async () => {
  setChainForTests(undefined);
  resetWorkerCacheForTests();
  await fixture.close();
});

// ---------------------------------------------------------------- seededExcludedFromAggregates

describe('seededExcludedFromAggregates', () => {
  /** Three real and two seeded, every one a `verify-open` whose listing claims the door is open. */
  async function seedFive(): Promise<void> {
    await seedCompleted(1, 'closed');
    await seedCompleted(2, 'closed');
    await seedCompleted(3, 'open');
    await seedCompleted(4, 'closed', { worker: SEEDED_WORKER });
    await seedCompleted(5, 'closed', { worker: SEEDED_WORKER });
  }

  it('counts three places and two wrong listings, and the seeded pair changes nothing', async () => {
    await seedFive();
    const written = await syncObservations({ db: fixture.db });
    expect(written).toHaveLength(5);

    const specs = new Map(
      written.map((row) => [row.task_id, listing({ claimed_open: true, source: 'google' })]),
    );
    const delta = listingDelta(written, specs);

    expect(delta.checked_places).toBe(3);
    expect(delta.wrong_listings).toBe(2);
    expect(delta.sentence).toBe('we checked 3 places; the listing was wrong about 2');

    const sources = Object.values(delta.by_source);
    expect(sources.reduce((n, s) => n + s.checked_places, 0)).toBe(delta.checked_places);
    expect(sources.reduce((n, s) => n + s.wrong_listings, 0)).toBe(delta.wrong_listings);

    // Dropping the seeded rows before the count changes nothing, which is the whole claim.
    const realOnly = written.filter((row) => !row.seeded);
    expect(realOnly).toHaveLength(3);
    expect(listingDelta(realOnly, specs)).toEqual(delta);
  });

  it('serves three rows by default and five with include_seeded, with one delta either way', async () => {
    await seedFive();

    const plain = await body('http://localhost/public/observations');
    expect(plain.res.status).toBe(200);
    expect(plain.res.headers.get('cache-control')).toBe('public, max-age=30');
    expect(plain.json.observations).toHaveLength(3);
    expect(plain.json.delta).toMatchObject({
      checked_places: 3,
      wrong_listings: 2,
      sentence: 'we checked 3 places; the listing was wrong about 2',
    });
    expect(plain.json.disclosure).toBe('real observations only; seeded rows excluded');

    const withSeeded = await body('http://localhost/public/observations?include_seeded=1');
    const rows = withSeeded.json.observations as Record<string, unknown>[];
    expect(rows).toHaveLength(5);

    const seededRows = rows.filter((row) => row.seeded === true);
    expect(seededRows).toHaveLength(2);
    for (const row of seededRows) {
      expect(row.confidence).toBe(0);
      expect(row.worker_verified).toBe(false);
    }

    expect(withSeeded.json.delta).toEqual(plain.json.delta);
  });
});

// ---------------------------------------------------------------- publicObservationShape

describe('publicObservationShape', () => {
  it('publishes the nine fields minus the nullifier, and nothing private beside them', async () => {
    await seedCompleted(1, 'closed');

    const { res, text, json } = await body('http://localhost/public/observations');
    expect(res.status).toBe(200);

    // The key, not the value: a body that carries `"note":` at all has published one.
    for (const key of [
      'worker_nullifier', 'exact_lat', 'exact_lon', 'lat', 'lon',
      'note', 'spec', 'spec_json', 'payer', 'agent_id', 'buyer',
    ]) {
      expect(text).not.toContain(`"${key}":`);
    }
    // The sentinels planted in the private columns, hunted in the raw body.
    expect(text).not.toContain(SENTINEL_SPEC);
    expect(text).not.toContain(SENTINEL_NOTE);
    expect(text).not.toContain(SENTINEL_TOKEN);
    expect(text).not.toContain(NULLIFIER_HEX);
    expect(text).not.toContain(AGENT_ID);
    expect(text).not.toContain(PAYER);
    expect(text).not.toContain(String(PLACE_LAT));

    const rows = json.observations as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        'claim', 'confidence', 'evidence_hash', 'observation_id',
        'observed_at', 'place_key', 'seeded', 'task_id', 'worker_verified',
      ]);
      expect(typeof row.worker_verified).toBe('boolean');
    }
  });

  it('filters by place_id and refuses one that is not an OpenStreetMap id', async () => {
    await seedCompleted(1, 'closed');
    await seedCompleted(2, 'open');

    const filtered = await body('http://localhost/public/observations?place_id=node/2734018561');
    expect(filtered.json.place_id).toBe('node/2734018561');
    expect(filtered.json.observations).toHaveLength(1);

    const bad = await body('http://localhost/public/observations?place_id=foo');
    expect(bad.res.status).toBe(400);
    expect(bad.json).toMatchObject({ error: 'invalid_request', field: 'place_id' });
  });

  it('inserts exactly one row for a released task and none on the second pass', async () => {
    await seedCompleted(1, 'closed');

    const first = await syncObservations({ db: fixture.db });
    expect(first).toHaveLength(1);
    expect(await fixture.db.select().from(observations)).toHaveLength(1);

    // The pass reconciles rather than backfills, so it revisits the task and rewrites the
    // same key — which is what "inserts none" has to mean: still one row, never a second.
    const second = await syncObservations({ db: fixture.db });
    expect(second.map((row) => row.observation_id)).toEqual(['obs-1']);
    expect(await fixture.db.select().from(observations)).toHaveLength(1);

    // The upsert is keyed on `obs-<task_id>`, so a direct re-record is a no-op too.
    await recordObservation(1n, { db: fixture.db });
    const rows = await fixture.db.select().from(observations);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.observationId).toBe('obs-1');
    expect(rows[0]?.geohash5).toBe(AREA);
  });

  it('keeps a submit-time row for an unfinished task out of the wall and out of the sentence', async () => {
    // What T-17 writes the moment a worker hands the proof in: `obs-<task_id>`, at 0.9,
    // for a task that is only submitted. Four of them, each ending somewhere that is not
    // the worker being paid.
    const unfinished = [
      { id: 11n, state: 'submitted' },
      { id: 12n, state: 'disputed' },
      { id: 13n, state: 'refunded' },
      { id: 14n, state: 'resolved' },
    ];
    for (const { id, state } of unfinished) {
      const place = `node/${9000000 + Number(id)}`;
      await insertTask(
        mkTask({
          taskId: id,
          state,
          answer: 'closed',
          proofHash: hashOf(2000 + Number(id)),
          spec: verifyOpenSpec({ place: { ...PLACE, place_id: place } }),
          txRelease: state === 'resolved' ? hashOf(3000 + Number(id)) : null,
        }),
      );
      await insertSubmitTimeRow(id, place);
    }
    // The resolved one went to the buyer, which is the operator judging the proof worthless.
    await fixture.db.insert(adminAudit).values({
      id: 'a-14',
      action: '/admin/resolve',
      tx: hashOf(3014),
      payload: { route: '/admin/resolve', body: { task_id: '14', to_buyer: true }, outcome: 'ok' },
    });

    const before = await body('http://localhost/public/observations');
    expect(before.json.observations).toHaveLength(0);
    expect(before.json.delta).toMatchObject({
      checked_places: 0,
      wrong_listings: 0,
      sentence: 'we checked 0 places; the listing was wrong about 0',
    });
    // The rows are still in the table — this task deletes nothing, it just refuses to read them.
    expect(await fixture.db.select().from(observations)).toHaveLength(4);

    // One completed task beside them, to show the filter is a filter and not an empty query.
    await seedCompleted(1, 'closed');
    const after = await body('http://localhost/public/observations');
    expect(after.json.observations).toHaveLength(1);
    expect(after.json.delta).toMatchObject({ checked_places: 1, wrong_listings: 1 });
  });

  it('rewrites a submit-time 0.9 row at 0.6 when the capture sat outside the TTL window', async () => {
    const taskId = 21n;
    const hash = hashOf(2021);
    await insertTask(
      mkTask({
        taskId,
        answer: 'closed',
        proofHash: hash,
        spec: verifyOpenSpec({ place: { ...PLACE, place_id: 'node/9100021' } }),
      }),
    );
    // Inside the fence and precise, but captured ten minutes before the claim — which the
    // submit route cannot know is wrong yet, and which this task's rule downgrades.
    await insertProof(
      mkProof({ hash, taskId, capturedAt: new Date(CLAIMED_AT.getTime() - 600_000) }),
    );
    await insertSubmitTimeRow(taskId, 'node/9100021', { confidence: '0.9', evidenceHash: hash });

    const [provisional] = await fixture.db.select().from(observations);
    expect(Number(provisional?.confidence)).toBe(0.9);

    const written = await syncObservations({ db: fixture.db });
    expect(written.map((row) => row.confidence)).toEqual([0.6]);

    const rows = await fixture.db.select().from(observations);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.observationId).toBe('obs-21');
    expect(Number(rows[0]?.confidence)).toBe(0.6);
  });

  it('observes a dispute resolved to the worker and never one resolved to the buyer', async () => {
    const toWorker = hashOf(0xaa);
    const toBuyer = hashOf(0xbb);
    await insertTask({
      ...mkTask({ taskId: 7n, state: 'resolved', txRelease: toWorker, answer: 'closed' }),
      specJson: verifyOpenSpec({ place: { ...PLACE, place_id: 'node/7000007' } }),
    });
    await insertTask({
      ...mkTask({ taskId: 8n, state: 'resolved', txRelease: toBuyer, answer: 'closed' }),
      specJson: verifyOpenSpec({ place: { ...PLACE, place_id: 'node/8000008' } }),
    });
    await fixture.db.insert(adminAudit).values([
      { id: 'a-7', action: '/admin/resolve', tx: toWorker, payload: { route: '/admin/resolve', body: { task_id: '7', to_buyer: false }, outcome: 'ok' } },
      { id: 'a-8', action: '/admin/resolve', tx: toBuyer, payload: { route: '/admin/resolve', body: { task_id: '8', to_buyer: true }, outcome: 'ok' } },
    ]);

    const written = await syncObservations({ db: fixture.db });
    expect(written.map((row) => row.task_id)).toEqual(['7']);
  });
});
