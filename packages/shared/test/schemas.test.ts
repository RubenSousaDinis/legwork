import { describe, expect, it } from 'vitest';
import {
  Place, VerifyOpenSpec, PhotoOfSpec, CallConfirmSpec, CompareTwoSpec, CALL_CONFIRM_TEMPLATES, CALL_CONFIRM_DENYLIST,
  VerifyOpenProof, CallConfirmProof, CompareTwoProof, RefusalPayload, InvalidRequest, WorkerAnswer, wrapWorkerAnswer,
  Observation, PublicObservation, specHash, canonicalJson, makeEnvelope, Envelope, DemoData, poolString,
  NO_RETRY_SENTENCE, API_ROUTES, MCP_TOOLS, TaskView, HEADERS,
} from '../src/index.js';

const place = { place_id: 'node/2734018563', name: 'Farmácia Central', street_address: 'Rua Direita 12', locality: 'Leiria', country: 'PT' as const };
const verifyOpen = { place, question: 'open_now' as const, claimed_open: true, claimed_hours: 'Mon–Fri 09:00–19:00', source: 'google' as const };
const sha = 'a'.repeat(64);
const kec = `0x${'b'.repeat(64)}` as const;
const NOW = Date.parse('2026-09-05T10:00:00Z');
const env = makeEnvelope(() => NOW);

describe('Place', () => {
  it('accepts an OSM id', () => expect(Place.parse(place).place_id).toBe('node/2734018563'));
  it('rejects a Google id as the key', () => expect(Place.safeParse({ ...place, place_id: 'ChIJN1t_tDeuEmsR' }).success).toBe(false));
});

describe('specs', () => {
  it('verify-open: happy / wrong question', () => {
    expect(VerifyOpenSpec.parse(verifyOpen).question).toBe('open_now');
    expect(VerifyOpenSpec.safeParse({ ...verifyOpen, question: 'is_busy' }).success).toBe(false);
  });
  it('photo-of: happy / subject outside the list', () => {
    expect(PhotoOfSpec.parse({ place, subject: 'hours_sign', source: 'osm' }).subject).toBe('hours_sign');
    expect(PhotoOfSpec.safeParse({ place, subject: 'person', source: 'osm' }).success).toBe(false);
  });
  it('call-confirm: happy / non-E.164 phone', () => {
    const ok = CallConfirmSpec.parse({ place, phone: '+351244000000', template_id: 'have_item', slots: { item: 'água 1.5 L' } });
    expect(ok.template_id).toBe('have_item');
    expect(CallConfirmSpec.safeParse({ place, phone: '244 000 000', template_id: 'open_now', slots: {} }).success).toBe(false);
  });
  it('call-confirm templates and denylist are data', () => {
    expect(Object.keys(CALL_CONFIRM_TEMPLATES)).toHaveLength(6);
    expect(CALL_CONFIRM_TEMPLATES.price_of.answers).toContain('unknown');
    expect(CALL_CONFIRM_DENYLIST).toContain('palavra-passe');
    expect(CALL_CONFIRM_DENYLIST).toContain('em meu nome');
  });
  it('compare-two: happy / image without url', () => {
    const item = { kind: 'image' as const, url: 'https://x.test/a.jpg', sha256: sha };
    expect(CompareTwoSpec.parse({ a: item, b: item, criterion_id: 'more_legible' }).criterion_id).toBe('more_legible');
    expect(CompareTwoSpec.safeParse({ a: { kind: 'image', sha256: sha }, b: item, criterion_id: 'more_legible' }).success).toBe(false);
  });
});

describe('proofs', () => {
  const base = { photo_hash: kec, gps: { lat: 39.7436, lon: -8.8071, accuracy_m: 80 }, gps_unavailable: false, worker_confirmed_at_place: true, captured_at: '2026-09-05T10:00:00Z', answer: 'open' as const };
  it('verify-open: happy', () => expect(VerifyOpenProof.parse(base).answer).toBe('open'));
  it('GPS downgrade needs gps=null and the tapped confirmation', () => {
    expect(VerifyOpenProof.parse({ ...base, gps: null, gps_unavailable: true }).gps_unavailable).toBe(true);
    expect(VerifyOpenProof.safeParse({ ...base, gps: null, gps_unavailable: false }).success).toBe(false);
    expect(VerifyOpenProof.safeParse({ ...base, gps: null, gps_unavailable: true, worker_confirmed_at_place: false }).success).toBe(false);
  });
  it('call-confirm: the answer must match the template', () => {
    expect(CallConfirmProof.parse({ template_id: 'open_now', answer: 'yes', called_at: '2026-09-05T10:00:00Z' }).answer).toBe('yes');
    expect(CallConfirmProof.safeParse({ template_id: 'open_now', answer: 'unknown', called_at: '2026-09-05T10:00:00Z' }).success).toBe(false);
  });
  it('compare-two: reason is capped at 120', () => {
    expect(CompareTwoProof.parse({ choice: 'a', reason: 'sharper' }).choice).toBe('a');
    expect(CompareTwoProof.safeParse({ choice: 'a', reason: 'x'.repeat(121) }).success).toBe(false);
  });
});

describe('refusal / worker answer / observation', () => {
  it('refusal carries the fixed no-retry sentence', () => {
    const r = RefusalPayload.parse({ refused: true, class: 'authentication circumvention', reason: 'asks for a code', rule_id: 'deny.code', retryable: false, allowed_task_types: ['verify-open'], message: NO_RETRY_SENTENCE });
    expect(r.class).toBe('authentication circumvention');
    expect(RefusalPayload.safeParse({ ...r, message: 'try again later' }).success).toBe(false);
  });
  it('invalid_request is a different shape and never a refusal', () => {
    expect(InvalidRequest.parse({ error: 'invalid_request', field: 'amount_usdc', reason: 'below floor' }).error).toBe('invalid_request');
  });
  it('worker answer is always marked untrusted', () => {
    expect(wrapWorkerAnswer('closed', 'sign on door')).toEqual({ answer: 'closed', note: 'sign on door', _source: 'worker', _untrusted: true });
    expect(WorkerAnswer.safeParse({ answer: 'closed', _source: 'worker', _untrusted: false }).success).toBe(false);
  });
  it('a seeded observation has confidence 0, and the public view has no nullifier', () => {
    const o = { observation_id: 'o1', place_key: 'node/1', claim: { type: 'open_now', value: 'closed' }, evidence_hash: kec, worker_nullifier: '0xabc', observed_at: '2026-09-05T10:00:00Z', confidence: 0.9, task_id: '1', seeded: false };
    expect(Observation.parse(o).confidence).toBe(0.9);
    expect(Observation.safeParse({ ...o, seeded: true, confidence: 0.9 }).success).toBe(false);
    expect('worker_nullifier' in PublicObservation.parse(o)).toBe(false);
  });
});

describe('envelope', () => {
  const ok = { task_type: 'verify-open' as const, spec: verifyOpen, amount_usdc: 3.0 };
  it('applies the TTL defaults', () => {
    const e = env.parse(ok);
    expect(e.claim_ttl_s).toBe(1800); expect(e.submit_ttl_s).toBe(3600); expect(e.dispute_window_s).toBe(86400);
  });
  it('enforces the price floor per type', () => {
    expect(env.safeParse({ ...ok, amount_usdc: 2.99 }).success).toBe(false);
    expect(env.safeParse({ task_type: 'compare-two', spec: { a: { kind: 'text', text: 'a', sha256: sha }, b: { kind: 'text', text: 'b', sha256: sha }, criterion_id: 'more_legible' }, amount_usdc: 1.0 }).success).toBe(true);
    expect(env.safeParse({ ...ok, amount_usdc: 10.01 }).success).toBe(false);
  });
  it('rejects a spec over 300 chars once canonicalised', () => {
    expect(env.safeParse({ ...ok, spec: { ...verifyOpen, claimed_hours: 'x'.repeat(60), place: { ...place, name: 'N'.repeat(120), street_address: 'S'.repeat(120) } } }).success).toBe(false);
  });
  it('need_by must be ≥ 20 minutes out', () => {
    expect(env.safeParse({ ...ok, need_by: new Date(NOW + 19 * 60_000).toISOString() }).success).toBe(false);
    expect(env.safeParse({ ...ok, need_by: new Date(NOW + 21 * 60_000).toISOString() }).success).toBe(true);
  });
  it('the exported Envelope uses the real clock', () => expect(Envelope.safeParse(ok).success).toBe(true));
});

describe('specHash', () => {
  it('is key-order independent and whitespace free', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(specHash({ b: 1, a: 2 })).toBe(specHash({ a: 2, b: 1 }));
  });
  it('golden vectors — the API, MCP and contracts must all produce these', () => {
    expect(specHash({})).toBe('0xb48d38f93eaa084033fc5970bf96e559c33c4cdc07d889ab00b4d63f9590739d');
    // the Act-1 fixture, pinned so a silent canonicalisation change fails here first
    expect(specHash(verifyOpen)).toBe('0x5aedd97718069caf932023e39b31c3c8100423ce01d748599714f6579d9838ba');
  });
});

describe('contracts', () => {
  it('every route has an auth class and at least one response', () => {
    for (const [name, r] of Object.entries(API_ROUTES)) {
      expect(r.auth, name).toBeTruthy();
      expect(Object.keys(r.responses).length, name).toBeGreaterThan(0);
    }
    expect(Object.keys(API_ROUTES).length).toBeGreaterThanOrEqual(35);
    expect(HEADERS.buyerToken).toBe('X-Buyer-Token');
  });
  it('POST /tasks answers 201 with a buyer_token', () => {
    const r = API_ROUTES.postTasks.responses[201];
    expect(r.safeParse({ task_id: '1', buyer_token: 'x'.repeat(43), status: 'open', spec_hash: kec, price_usdc: 3.45, eta_seconds: 600, poll_after_seconds: 3, dashboard_url: 'https://d.test/task/1' }).success).toBe(true);
  });
  it('the six MCP tools all run in both modes and all carry dashboard_url', () => {
    expect(Object.keys(MCP_TOOLS)).toHaveLength(6);
    for (const t of Object.values(MCP_TOOLS)) { expect(t.hosted && t.local).toBe(true); }
    const tv = TaskView.parse({ task_id: '1', status: 'open', task_type: 'verify-open', amount_usdc: 3, fee_usdc: 0.45, area: 'ez5ku', posted_at: '2026-09-05T10:00:00Z', tx: { post: kec }, dashboard_url: 'https://d.test/task/1', changed: false, poll_after_seconds: 3 });
    expect(tv.dashboard_url).toContain('https://');
  });
});

describe('demo data', () => {
  it('renders the pool string and never a bare total', () => {
    expect(poolString(1, 20)).toBe('1 real · +20 seeded (demo data)');
    expect(DemoData.shape.money.shape.worker_receives.value).toBe(3.0);
  });
});
