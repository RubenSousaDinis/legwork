import { http, HttpResponse } from 'msw';
import { scenario } from './scenarios';

/**
 * Every worker-facing route in `packages/shared/src/api-contract.ts`, answered from fixtures
 * whose shapes are the contract's own — `fixturesMatchContract` parses each one below with the
 * route's response schema, so a drifting mock is a red test rather than a green lie.
 *
 * Branching lives in `mocks/scenarios.ts`; a handler only reads it.
 */

// ------------------------------------------------------------------ literals

/** 32 hex characters twice: a 64-character hash, the length `TxHash` requires. */
function hash(half: string): string {
  return `0x${half}${half}`;
}

/** 20 hex characters twice: a 40-character address, the length `EvmAddress` requires. */
function address(half: string): string {
  return `0x${half}${half}`;
}

export const WORKER_ADDRESS = address('f0417a2b3c4d5e6f7081');
export const NULLIFIER = hash('1f3e5a7c9b0d2468ace02468ace02468');

const TX_POST = hash('a1b2c3d4e5f60718293a4b5c6d7e8f90');
const TX_CLAIM = hash('0c1d2e3f405162738495a6b7c8d9eaf0');
const TX_SUBMIT = hash('2f7a1c9e4b8d60315af2c7e9d4b60815');
const TX_RELEASE = hash('3b6d9f0247ace13579bdf02468ace135');
const TX_REGISTER = hash('4c7e0a1358bdf02469ace13579bdf024');
const TX_DISPUTE = hash('5d8f1b24609ace13579bdf02468ace13');
const PROOF_HASH = hash('6e9024681357bdf0ace13579bdf02468');

/** Leiria, rounded to 3 decimals (≈100 m) — the only precision a public surface ever sees. */
const COORDINATE_ROUNDED = { lat: 39.749, lon: -8.808 };
const AREA = 'ez5ku';
const DASHBOARD_URL = 'https://legwork.example/dashboard/1024';
const PROOF_URL = `https://legwork.example/api/proofs/${PROOF_HASH}?exp=1757034000&sig=${'ab'.repeat(32)}`;

const POSTED_AT = '2026-09-06T09:40:00.000Z';
const CLAIMED_AT = '2026-09-06T09:52:00.000Z';
const SUBMITTED_AT = '2026-09-06T10:03:00.000Z';
const RELEASED_AT = '2026-09-06T10:07:00.000Z';
const CLAIM_EXPIRES_AT = '2026-09-06T10:22:00.000Z';
const SUBMIT_DEADLINE = '2026-09-06T10:52:00.000Z';
const COOLDOWN_UNTIL = '2026-09-06T10:15:00.000Z';

/** The shapes are the ones in packages/shared/src/api-contract.ts — nothing invented here. */
export const RP_CONTEXT = {
  rp_id: 'rp_0123456789abcdef',
  nonce: '9f1c3a7d5e2b4806a1c9d7e3f5b20486',
  created_at: 1_757_030_400,
  expires_at: 1_757_030_700,
  signature:
    '0x2f7a1c9e4b8d60315af2c7e9d4b6081537ac2e9f4b7d61035ae2c8f9d4b70614' +
    '5ac3e8f2d9b60417ae2c9f8d4b6103571c',
};

export const VERIFY_RESPONSE = {
  verified: true as const,
  nullifier: NULLIFIER,
  level: 'orb',
  world_response: { nullifier_hash: NULLIFIER, verification_level: 'orb' },
};

export const NONCE = 'a3f19c7e5b02d846';

export const SESSION_NONCE_RESPONSE = { nonce: NONCE };

export const SESSION_RESPONSE = {
  worker: WORKER_ADDRESS,
  nullifier: NULLIFIER,
  mode: 'walletAuth' as const,
  token: 'eyJhbGciOiJIUzI1NiJ9.header-free-placeholder.signature-placeholder',
};

export const REGISTER_RESPONSE = { tx: TX_REGISTER, worker: WORKER_ADDRESS };

/**
 * `GET /tasks`. Row one is the real demo task, row two is seeded — the list is honest about
 * which is which, and every seeded row carries the flag T-25 renders as a `seeded` chip.
 */
export const TASKS_TWO_ROWS = {
  tasks: [
    {
      task_id: '1024',
      task_type: 'verify-open' as const,
      title: 'Padaria Central · Rua de Alcobaça 12, Leiria',
      price_usdc: 3.0,
      distance_m: 180,
      state: 'open' as const,
      seeded: false,
      brief: {
        place: {
          name: 'Padaria Central',
          street_address: 'Rua de Alcobaça 12',
          locality: 'Leiria',
        },
        question: 'Is it open right now?',
      },
    },
    {
      task_id: '1025',
      task_type: 'photo-of' as const,
      title: 'Mercado Municipal · Largo 5 de Outubro, Leiria',
      price_usdc: 3.0,
      distance_m: 640,
      state: 'open' as const,
      seeded: true,
      brief: {
        place: {
          name: 'Mercado Municipal',
          street_address: 'Largo 5 de Outubro',
          locality: 'Leiria',
        },
        subject: 'the opening-hours sign at the main entrance',
      },
    },
  ],
};

export const TASKS_EMPTY = { tasks: [] };

export const CLAIM_RESPONSE = {
  tx: TX_CLAIM,
  claim_expires_at: CLAIM_EXPIRES_AT,
  submit_deadline: SUBMIT_DEADLINE,
};

export const IN_COOLDOWN = { error: 'InCooldown' as const, cooldown_until: COOLDOWN_UNTIL };
export const ALREADY_CLAIMED = { error: 'AlreadyClaimed' as const, active_task_id: '1024' };
export const SEEDED_CANNOT_CLAIM = { error: 'SeededCannotClaimExternal' as const };
export const NULLIFIER_ALREADY_REGISTERED = { error: 'nullifier_already_registered' as const };
export const UNAUTHORIZED = { error: 'unauthorized' as const };

export const RELEASE_CLAIM_RESPONSE = { tx: TX_CLAIM };

export const PROOFS_RESPONSE = {
  proofHash: PROOF_HASH,
  url: PROOF_URL,
  captured_at: SUBMITTED_AT,
};

export const SUBMIT_RESPONSE = { tx: TX_SUBMIT, status: 'submitted' as const };

export const SUBMIT_DISPUTED_RESPONSE = {
  tx: TX_SUBMIT,
  status: 'disputed' as const,
  auto_dispute_reason: 'geofence' as const,
  dispute_tx: TX_DISPUTE,
};

export const REPORT_RESPONSE = { recorded: true as const };

export const EARNINGS_ZERO = { released_usdc: 0, completed: 0, score: 0, distinct_raters: 0 };

/** The worker keeps the posted rate: one released task is 3.00, never a deducted figure. */
export const EARNINGS_ONE_PAID = {
  released_usdc: 3.0,
  completed: 1,
  score: 5,
  distinct_raters: 1,
};

const PROOF_VIEW = {
  hash: PROOF_HASH,
  hash_ok: true,
  captured_at: SUBMITTED_AT,
  coordinate_rounded: COORDINATE_ROUNDED,
  gps_unavailable: false,
};

export const TASK_SUBMITTED = {
  task_id: '1024',
  status: 'submitted' as const,
  task_type: 'verify-open' as const,
  amount_usdc: 3.0,
  fee_usdc: 0.45,
  area: AREA,
  posted_at: POSTED_AT,
  claimed_at: CLAIMED_AT,
  submitted_at: SUBMITTED_AT,
  answer: { answer: 'open', _source: 'worker' as const, _untrusted: true as const },
  proof: PROOF_VIEW,
  tx: { post: TX_POST, claim: TX_CLAIM, submit: TX_SUBMIT },
  dashboard_url: DASHBOARD_URL,
  changed: true,
  poll_after_seconds: 3,
};

/** Released, with the proof beside it — escrow never shows a release without one. */
export const TASK_RELEASED = {
  ...TASK_SUBMITTED,
  status: 'released' as const,
  released_at: RELEASED_AT,
  tx: { post: TX_POST, claim: TX_CLAIM, submit: TX_SUBMIT, release: TX_RELEASE },
  poll_after_seconds: 0,
};

// ------------------------------------------------------------- request spies

/** What the last `POST /idkit/verify` received, verbatim — the forwarding assertion reads it. */
let lastVerifyText: string | null = null;

export function lastVerifyBody(): string | null {
  return lastVerifyText;
}

/** Every `POST /register` body seen this test, parsed — `registerBodyExact` reads it. */
let registerBodies: unknown[] = [];

export function registerRequests(): unknown[] {
  return registerBodies;
}

/** Every `POST /session` body seen this test — `bothSessionModes` reads it. */
let sessionBodies: unknown[] = [];

export function sessionRequests(): unknown[] {
  return sessionBodies;
}

export function resetLastVerifyBody(): void {
  lastVerifyText = null;
  registerBodies = [];
  sessionBodies = [];
}

// ----------------------------------------------------------------- handlers

const json = HttpResponse.json;

export const handlers = [
  http.post('*/api/idkit/request', async ({ request }) => {
    const body = (await request.json()) as { action?: unknown } | null;
    if (typeof body?.action !== 'string' || body.action.length === 0) {
      return json(
        { error: 'invalid_request', field: 'action', reason: 'action must be a non-empty string' },
        { status: 400 },
      );
    }
    return json({ rp_context: RP_CONTEXT });
  }),

  http.post('*/api/idkit/verify', async ({ request }) => {
    lastVerifyText = await request.text();
    if (scenario().idkitVerify === 'nullifier_already_registered') {
      return json(NULLIFIER_ALREADY_REGISTERED, { status: 409 });
    }
    return json(VERIFY_RESPONSE);
  }),

  http.get('*/api/session/nonce', () => json(SESSION_NONCE_RESPONSE)),

  http.post('*/api/session', async ({ request }) => {
    const body = (await request.json()) as { mode?: unknown; worker_address?: unknown } | null;
    sessionBodies.push(body);
    const mode = body?.mode === 'idkit' ? ('idkit' as const) : ('walletAuth' as const);
    const worker =
      mode === 'idkit' && typeof body?.worker_address === 'string'
        ? body.worker_address
        : WORKER_ADDRESS;
    return json({ ...SESSION_RESPONSE, mode, worker });
  }),

  http.post('*/api/register', async ({ request }) => {
    const body = (await request.json()) as { worker_address?: unknown } | null;
    registerBodies.push(body);
    const worker =
      typeof body?.worker_address === 'string' ? body.worker_address : WORKER_ADDRESS;
    return json({ ...REGISTER_RESPONSE, worker });
  }),

  // `/tasks/list` is the contract's path and `/tasks` is the one T-24 §2 and T-25 §2 call;
  // both are answered so neither task's tests hang on the spelling. See the PR body.
  http.get('*/api/tasks/list', () =>
    json(scenario().tasks === 'empty' ? TASKS_EMPTY : TASKS_TWO_ROWS),
  ),
  http.get('*/api/tasks', () => json(scenario().tasks === 'empty' ? TASKS_EMPTY : TASKS_TWO_ROWS)),

  http.post('*/api/tasks/:id/claim', () => {
    switch (scenario().claim) {
      case 'InCooldown':
        return json(IN_COOLDOWN, { status: 409 });
      case 'AlreadyClaimed':
        return json(ALREADY_CLAIMED, { status: 409 });
      case 'SeededCannotClaimExternal':
        return json(SEEDED_CANNOT_CLAIM, { status: 403 });
      default:
        return json(CLAIM_RESPONSE);
    }
  }),

  http.post('*/api/tasks/:id/release-claim', () => json(RELEASE_CLAIM_RESPONSE)),

  http.post('*/api/proofs', () => json(PROOFS_RESPONSE)),

  http.post('*/api/tasks/:id/submit', () =>
    json(scenario().submit === 'disputed' ? SUBMIT_DISPUTED_RESPONSE : SUBMIT_RESPONSE),
  ),

  http.post('*/api/tasks/:id/report', () => json(REPORT_RESPONSE)),

  http.get('*/api/me/earnings', () => {
    switch (scenario().earnings) {
      case 'unauthorized':
        return json(UNAUTHORIZED, { status: 401 });
      case 'one_paid':
        return json(EARNINGS_ONE_PAID);
      default:
        return json(EARNINGS_ZERO);
    }
  }),

  http.get('*/api/tasks/:id', () =>
    json(scenario().task === 'released' ? TASK_RELEASED : TASK_SUBMITTED),
  ),
];

/**
 * The 409 scenario as a standalone override: one person, one worker account.
 * `server.use(...)` it for a single test, or reach the same branch with
 * `setScenario({ idkitVerify: 'nullifier_already_registered' })`.
 */
export const nullifierAlreadyRegistered = http.post('*/api/idkit/verify', async ({ request }) => {
  lastVerifyText = await request.text();
  return json(NULLIFIER_ALREADY_REGISTERED, { status: 409 });
});

/**
 * Every fixture above, tagged with the contract route and status it answers.
 * `fixturesMatchContract` walks this table; a new handler belongs here too.
 */
export const RESPONSE_FIXTURES = [
  { route: 'idkitRequest', status: 200, body: { rp_context: RP_CONTEXT } },
  { route: 'idkitVerify', status: 200, body: VERIFY_RESPONSE },
  { route: 'idkitVerify', status: 409, body: NULLIFIER_ALREADY_REGISTERED },
  { route: 'sessionNonce', status: 200, body: SESSION_NONCE_RESPONSE },
  { route: 'session', status: 200, body: SESSION_RESPONSE },
  { route: 'session', status: 200, body: { ...SESSION_RESPONSE, mode: 'idkit' } },
  { route: 'register', status: 200, body: REGISTER_RESPONSE },
  { route: 'listTasks', status: 200, body: TASKS_TWO_ROWS },
  { route: 'listTasks', status: 200, body: TASKS_EMPTY },
  { route: 'claim', status: 200, body: CLAIM_RESPONSE },
  { route: 'claim', status: 409, body: IN_COOLDOWN },
  { route: 'claim', status: 409, body: ALREADY_CLAIMED },
  { route: 'claim', status: 403, body: SEEDED_CANNOT_CLAIM },
  { route: 'releaseClaim', status: 200, body: RELEASE_CLAIM_RESPONSE },
  { route: 'proofs', status: 200, body: PROOFS_RESPONSE },
  { route: 'submit', status: 200, body: SUBMIT_RESPONSE },
  { route: 'submit', status: 200, body: SUBMIT_DISPUTED_RESPONSE },
  { route: 'report', status: 200, body: REPORT_RESPONSE },
  { route: 'earnings', status: 200, body: EARNINGS_ZERO },
  { route: 'earnings', status: 200, body: EARNINGS_ONE_PAID },
  { route: 'getTask', status: 200, body: TASK_SUBMITTED },
  { route: 'getTask', status: 200, body: TASK_RELEASED },
] as const;
