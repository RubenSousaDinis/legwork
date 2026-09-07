/**
 * The seeded CLI worker — the half of the green loop that walks to the shop.
 *
 *   pnpm cli-worker -- --area ez1dp --place scripts/fixtures/demo-place.json
 *
 * It drives the **relayed API routes** and nothing else. There is no `claim()` and no
 * `submit()` on any contract in this file: going through the API is what exercises the
 * submit-time checks the mini-app worker meets — content-hash reuse and the 150 m geofence —
 * and it is what keeps this worker honest. `CLI_WORKER_PRIVATE_KEY` signs a SIWE message and
 * signs nothing else; the relayer pays every gas fee and the registry is what says this
 * address may work at all.
 *
 * The worker is **seeded** (`WorkerRegistry.isSeeded`), which is a disclosed demo staff
 * account rather than a verified human: it may only take tasks from an allowlisted payer, its
 * observations are written at confidence 0, and the proof it hands in says so in its note.
 *
 * The fixture photo is generated at runtime and never committed. It carries the task id and
 * the capture instant in its pixels, so two runs against the same place produce different
 * bytes — the same hash for the same place and type auto-disputes, which is exactly the
 * behaviour a rehearsal must not trip over.
 */
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { keccak256, type Address, type Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';

// `@legwork/shared` is a workspace package; the constants are imported from its source the
// same way `scripts/register-identity.ts` and `scripts/osm-extract.ts` reach for theirs, so a
// script keeps running under the repository's root `tsx` as well as under this package.
import { CHAIN_ID } from '../packages/shared/src/addresses.ts';
import { GEOFENCE_M } from '../packages/shared/src/constants.ts';

// ------------------------------------------------------------------ the place

/** `scripts/fixtures/demo-place.json`. The coordinate is the operator's, not the API's. */
export interface DemoPlace {
  place_id: string;
  google_place_id?: string;
  name: string;
  street_address: string;
  locality: string;
  country: 'PT';
  lat: number;
  lon: number;
}

/**
 * Where the fixture lives when nobody says otherwise.
 *
 * Resolved against this file rather than against the working directory: `pnpm demo:run` runs
 * from `scripts/`, `pnpm --filter scripts …` from the repository root, and T-36 from neither.
 */
export const DEFAULT_PLACE_PATH = fileURLToPath(new URL('./fixtures/demo-place.json', import.meta.url));

export function loadDemoPlace(path: string): DemoPlace {
  const place = JSON.parse(readFileSync(path, 'utf8')) as DemoPlace;
  for (const key of ['place_id', 'name', 'street_address', 'locality', 'country'] as const) {
    if (typeof place[key] !== 'string' || place[key].length === 0) {
      throw new Error(`${path}: ${key} is missing`);
    }
  }
  if (typeof place.lat !== 'number' || typeof place.lon !== 'number') {
    throw new Error(`${path}: lat and lon are required — the jitter has nothing to jitter around`);
  }
  return place;
}

// ----------------------------------------------------------------- the camera

/** 640 × 480, the size a phone upload is resized to and small enough to post in one go. */
export const FIXTURE_WIDTH = 640;
export const FIXTURE_HEIGHT = 480;

export interface FixtureOptions {
  taskId: string;
  /** The instant printed into the image. Defaults to now. */
  at?: Date;
  /** Defaults to a random hue, so two captures inside one millisecond still differ. */
  colour?: string;
}

/** `#rrggbb` from three random bytes. The rectangle is decoration; the timestamp is the point. */
function randomColour(): string {
  return `#${randomInt(0, 0x1000000).toString(16).padStart(6, '0')}`;
}

/**
 * The proof photo, rendered from an in-memory SVG.
 *
 * Nothing is read from disk and nothing is written to it: `scripts/fixtures/.gitignore`
 * ignores `*.jpg` because a committed fixture is a pre-kickoff asset, and this project starts
 * fresh. The ISO instant and the task id go into the pixels so the JPEG bytes — and therefore
 * `keccak256` of them — differ on every run.
 */
export async function makeFixtureJpeg(options: FixtureOptions): Promise<Buffer> {
  const at = (options.at ?? new Date()).toISOString();
  const colour = options.colour ?? randomColour();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FIXTURE_WIDTH}" height="${FIXTURE_HEIGHT}">` +
    `<rect width="${FIXTURE_WIDTH}" height="${FIXTURE_HEIGHT}" fill="${colour}"/>` +
    `<text x="24" y="248" font-family="monospace" font-size="18" fill="#ffffff">` +
    `LEGWORK CLI FIXTURE ${at} ${options.taskId}</text>` +
    `</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

// --------------------------------------------------------------- the geometry

export interface Coordinate {
  lat: number;
  lon: number;
}

/** How far from the place the capture is allowed to land. Well inside `GEOFENCE_M`. */
export const JITTER_MAX_M = 50;

/** Mean Earth radius (IUGG), metres — the same figure `apps/api/src/services/geo.ts` uses. */
const EARTH_RADIUS_M = 6_371_008.8;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function haversineM(a: Coordinate, b: Coordinate): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A coordinate uniformly distributed in a disc of `maxM` metres around `centre`.
 *
 * `sqrt` of the uniform draw is what makes it uniform over the area rather than crowded at
 * the middle. The radius is a demo convenience, never a way past the fence: `maxM` defaults to
 * a third of `GEOFENCE_M`, and a caller asking for more than the fence is refused here.
 */
export function jitterCoordinate(
  centre: Coordinate,
  maxM: number = JITTER_MAX_M,
  random: () => number = Math.random,
): Coordinate {
  if (maxM >= GEOFENCE_M) {
    throw new Error(`jitter of ${maxM} m would leave the ${GEOFENCE_M} m fence`);
  }
  const distance = maxM * Math.sqrt(random());
  const bearing = 2 * Math.PI * random();
  const dLat = (distance * Math.cos(bearing)) / 111_320;
  const dLon = (distance * Math.sin(bearing)) / (111_320 * Math.cos(toRadians(centre.lat)));
  return { lat: centre.lat + dLat, lon: centre.lon + dLon };
}

// -------------------------------------------------------------------- the API

/** The three 409 codes `POST /tasks/:id/claim` answers with, each its own exit. */
export const CLAIM_CONFLICTS = ['InCooldown', 'AlreadyClaimed', 'SeededCannotClaimExternal'] as const;
export type ClaimConflict = (typeof CLAIM_CONFLICTS)[number];

/** Thrown with the contract's own error name, so the CLI can print the code and exit 1. */
export class ClaimConflictError extends Error {
  constructor(readonly code: ClaimConflict | string, readonly body: unknown) {
    super(`claim refused: ${code}`);
    this.name = 'ClaimConflictError';
  }
}

/** A stage that did not complete. The message is safe to print: it never carries a credential. */
export class StageError extends Error {
  constructor(readonly stage: string, message: string) {
    super(message);
    this.name = 'StageError';
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** A response body, trimmed for a terminal. Never a header, never a cookie, never a token. */
function describe(body: unknown): string {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

export interface WorkerSession {
  /** The JWT `POST /session` mints. `Authorization: Bearer` is the CLI's cookie jar. */
  token: string;
  /** The `set-cookie` value, sent alongside so either transport works. */
  cookie: string | undefined;
  worker: Address;
}

/**
 * `GET /session/nonce` → sign an ERC-4361 message → `POST /session`.
 *
 * The signature is over the nonce the server just issued and nothing else the caller chose,
 * so a message signed for another site cannot be replayed here. The key never leaves
 * `process.env` and neither it nor the session token is ever logged.
 */
export async function openWorkerSession(
  apiBaseUrl: string,
  account: PrivateKeyAccount,
): Promise<WorkerSession> {
  const nonceRes = await fetch(`${apiBaseUrl}/session/nonce`);
  if (!nonceRes.ok) {
    throw new StageError('session', `GET /session/nonce answered ${nonceRes.status}`);
  }
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  const message = createSiweMessage({
    domain: new URL(apiBaseUrl).host,
    address: account.address,
    statement: 'Sign in to Legwork',
    uri: apiBaseUrl,
    version: '1',
    chainId: Number(process.env['CHAIN_ID'] ?? CHAIN_ID),
    nonce,
    issuedAt: new Date(),
  });
  const signature = await account.signMessage({ message });

  const res = await fetch(`${apiBaseUrl}/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'walletAuth',
      payload: { status: 'success', message, signature, address: account.address, version: 1 },
      nonce,
    }),
  });
  const body = await readBody(res);
  if (!res.ok) {
    throw new StageError('session', `POST /session answered ${res.status} ${describe(body)}`);
  }
  const { token, worker } = body as { token: string; worker: Address };
  return { token, cookie: res.headers.getSetCookie().join('; ') || undefined, worker };
}

function sessionHeaders(session: WorkerSession): Record<string, string> {
  return {
    authorization: `Bearer ${session.token}`,
    ...(session.cookie ? { cookie: session.cookie } : {}),
  };
}

/** One row of `GET /tasks/list`, as this worker reads it. */
export interface BoardRow {
  task_id: string;
  state: string;
  seeded: boolean;
  price_usdc: number;
  distance_m?: number;
}

/**
 * The board, filtered to what this worker may take.
 *
 * The route lives at `/tasks/list` rather than at the brief's `GET /tasks?area=`: T-17 moved
 * it so `app/tasks/route.ts` stays POST-only, and filed the INTERFACE REQUEST on its own PR.
 * The query parameters are unchanged.
 */
export async function listTasks(
  apiBaseUrl: string,
  session: WorkerSession,
  query: { area?: string; lat?: number; lon?: number },
): Promise<BoardRow[]> {
  const url = new URL(`${apiBaseUrl}/tasks/list`);
  if (query.area) url.searchParams.set('area', query.area);
  if (query.lat !== undefined) url.searchParams.set('lat', String(query.lat));
  if (query.lon !== undefined) url.searchParams.set('lon', String(query.lon));

  const res = await fetch(url, { headers: sessionHeaders(session) });
  const body = await readBody(res);
  if (!res.ok) {
    throw new StageError('list', `GET /tasks/list answered ${res.status} ${describe(body)}`);
  }
  return (body as { tasks: BoardRow[] }).tasks;
}

// ------------------------------------------------------------------- the loop

export interface RunWorkerOptions {
  apiBaseUrl: string;
  /** `CLI_WORKER_PRIVATE_KEY`, read by the caller from `process.env` and never from here. */
  privateKey: Hex;
  place: DemoPlace;
  /** The geohash-5 the board is filtered by. */
  area?: string;
  /** When set, only this task is taken — `demo-run` knows the id it just posted. */
  taskId?: string;
  /** The board is polled every three seconds, as the mini-app does. */
  pollIntervalMs?: number;
  /** How long to wait for a row to appear before giving up. */
  timeoutMs?: number;
  /** Where the stage lines go. `demo-run` passes a sink so it can print its own. */
  log?: (line: string) => void;
  /** Everything but the chain-touching calls: session, board, and the fixture. */
  dryRun?: boolean;
}

export interface WorkerRunResult {
  taskId: string;
  worker: Address;
  claimTx?: string;
  submitTx?: string;
  proofHash?: Hex;
  status?: string;
  /** Set when the submit auto-disputed — reuse or geofence. Never a silent success. */
  autoDisputeReason?: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One errand, start to finish: sign in, wait for work, claim it, photograph it, hand it in.
 *
 * Exported so `demo-run` can drive it in-process and so T-36 can drive it against anvil.
 */
export async function runWorkerOnce(options: RunWorkerOptions): Promise<WorkerRunResult> {
  const log = options.log ?? ((line: string) => console.log(line));
  const pollIntervalMs = options.pollIntervalMs ?? 3000;
  const timeoutMs = options.timeoutMs ?? 180_000;
  const api = options.apiBaseUrl.replace(/\/$/, '');
  const account = privateKeyToAccount(options.privateKey);

  const session = await openWorkerSession(api, account);
  log(`SESSION worker ${session.worker}`);

  // Poll the board until something open shows up. A seeded worker only ever sees allowlisted
  // payers, so an empty board here means the buyer has not posted yet.
  const deadline = Date.now() + timeoutMs;
  let row: BoardRow | undefined;
  for (;;) {
    const rows = await listTasks(api, session, {
      ...(options.area ? { area: options.area } : {}),
      lat: options.place.lat,
      lon: options.place.lon,
    });
    // A named task is the one we came for whatever the board calls it: `demo-run` knows the id
    // it just posted, and a row it already holds shows up as `claimed`. Without a name, only an
    // open row is work.
    row = options.taskId
      ? rows.find((r) => r.task_id === options.taskId)
      : rows.find((r) => r.state === 'open');
    if (row) break;
    if (Date.now() > deadline) {
      throw new StageError(
        'list',
        `no open task${options.taskId ? ` ${options.taskId}` : ''} on the board after ${Math.round(timeoutMs / 1000)} s`,
      );
    }
    await sleep(pollIntervalMs);
  }
  const taskId = row.task_id;
  log(`FOUND task_id=${taskId}`);

  // The fixture is made before the claim so a slow encode does not eat the claim TTL.
  const bytes = await makeFixtureJpeg({ taskId });
  const capture = jitterCoordinate({ lat: options.place.lat, lon: options.place.lon });

  if (options.dryRun) {
    log(`DRY-RUN fixture ${bytes.byteLength} bytes, capture ${haversineM(options.place, capture).toFixed(1)} m from the place`);
    return { taskId, worker: session.worker };
  }

  const claimTx = await claimTask(api, session, taskId);
  log(`CLAIMED tx ${claimTx}`);

  const proof = await uploadProof(api, session, bytes, capture);
  const submit = await submitProof(api, session, taskId, proof, log);
  log(`SUBMITTED tx ${submit.tx}`);

  return {
    taskId,
    worker: session.worker,
    claimTx,
    submitTx: submit.tx,
    proofHash: proof.proofHash,
    status: submit.status,
    ...(submit.auto_dispute_reason ? { autoDisputeReason: submit.auto_dispute_reason } : {}),
  };
}

/**
 * `POST /tasks/:id/claim`, or the claim we are already holding.
 *
 * `AlreadyClaimed` naming *this* task is not a refusal — it is the answer to a question we did
 * not need to ask. A run that died after the claim (a bad upload, a dropped connection) is
 * resumed instead of stranding an errand nobody else may take, which on film day is the
 * difference between one retry and waiting out a 30-minute TTL.
 */
async function claimTask(api: string, session: WorkerSession, taskId: string): Promise<string> {
  const res = await fetch(`${api}/tasks/${taskId}/claim`, {
    method: 'POST',
    headers: sessionHeaders(session),
  });
  const body = await readBody(res);
  if (res.status === 409) {
    const conflict = body as { error?: string; active_task_id?: string };
    if (conflict.error === 'AlreadyClaimed' && conflict.active_task_id === taskId) {
      return await existingClaimTx(api, taskId);
    }
    throw new ClaimConflictError(conflict.error ?? 'conflict', body);
  }
  if (!res.ok) {
    throw new StageError('claim', `POST /tasks/${taskId}/claim answered ${res.status} ${describe(body)}`);
  }
  return (body as { tx: string }).tx;
}

/** The hash of the claim we already hold, read back off the task rather than invented. */
async function existingClaimTx(api: string, taskId: string): Promise<string> {
  const res = await fetch(`${api}/tasks/${taskId}`);
  const body = await readBody(res);
  const claim = (body as { tx?: { claim?: string } }).tx?.claim;
  if (!claim) {
    throw new StageError('claim', `task ${taskId} is already claimed by this worker but carries no claim transaction`);
  }
  return claim;
}

interface UploadedProof {
  proofHash: Hex;
  capturedAt: string;
  capture: Coordinate;
}

/** `POST /proofs`, multipart. The hash the chain carries is `keccak256` of these exact bytes. */
async function uploadProof(
  api: string,
  session: WorkerSession,
  bytes: Buffer,
  capture: Coordinate,
): Promise<UploadedProof> {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'fixture.jpg');
  form.set('lat', String(capture.lat));
  form.set('lon', String(capture.lon));
  form.set('accuracy_m', '25');

  const res = await fetch(`${api}/proofs`, {
    method: 'POST',
    headers: sessionHeaders(session),
    body: form,
  });
  const body = await readBody(res);
  if (!res.ok) {
    throw new StageError('proof', `POST /proofs answered ${res.status} ${describe(body)}`);
  }
  const uploaded = body as { proofHash: Hex; captured_at: string };
  const expected = keccak256(new Uint8Array(bytes));
  if (uploaded.proofHash !== expected) {
    throw new StageError('proof', `the API hashed something else: ${uploaded.proofHash} ≠ ${expected}`);
  }
  return { proofHash: uploaded.proofHash, capturedAt: uploaded.captured_at, capture };
}

interface SubmitResult {
  tx: string;
  status: string;
  auto_dispute_reason?: string;
}

/** How long to keep re-asking while the API's node catches up with our own claim. */
const SUBMIT_LAG_ATTEMPTS = 8;
const SUBMIT_LAG_DELAY_MS = 5000;

/**
 * `POST /tasks/:id/submit`.
 *
 * The brief names three fields; `VerifyOpenProof` in `packages/shared` — frozen — asks for the
 * whole photo proof, and the route refuses a `proofHash` that does not equal `photo_hash`.
 * The superset is sent and the PR says so.
 *
 * `not_claimed_by_caller` is retried rather than raised, because seconds after our own claim it
 * is almost never true. The route decides from `getTask`, and a Base Sepolia read can trail the
 * receipt that caused it — a different serverless invocation is a different connection to a
 * different node. Retrying asks for a fresh read; the claim either shows up or the window
 * genuinely closed, and the last attempt says which. Nothing else is retried: every other
 * conflict is an answer, not a lag.
 */
async function submitProof(
  api: string,
  session: WorkerSession,
  taskId: string,
  proof: UploadedProof,
  log: (line: string) => void,
): Promise<SubmitResult> {
  const body = JSON.stringify({
    proofHash: proof.proofHash,
    photo_hash: proof.proofHash,
    answer: 'closed',
    note: 'CLI fixture — seeded worker, not an observation',
    gps: { lat: proof.capture.lat, lon: proof.capture.lon, accuracy_m: 25 },
    gps_unavailable: false,
    worker_confirmed_at_place: false,
    captured_at: proof.capturedAt,
  });

  let last = '';
  for (let attempt = 1; attempt <= SUBMIT_LAG_ATTEMPTS; attempt += 1) {
    const res = await fetch(`${api}/tasks/${taskId}/submit`, {
      method: 'POST',
      headers: { ...sessionHeaders(session), 'content-type': 'application/json' },
      body,
    });
    const answer = await readBody(res);
    if (res.ok) return answer as SubmitResult;

    last = `${res.status} ${describe(answer)}`;
    const stale =
      res.status === 409 && (answer as { reason?: string }).reason === 'not_claimed_by_caller';
    if (!stale || attempt === SUBMIT_LAG_ATTEMPTS) break;

    log(`SUBMIT waiting for the API's node to see our claim (attempt ${attempt})`);
    await sleep(SUBMIT_LAG_DELAY_MS);
  }
  throw new StageError('submit', `POST /tasks/${taskId}/submit answered ${last}`);
}

// -------------------------------------------------------------------- the CLI

export interface CliArgs {
  area?: string;
  place: string;
  taskId?: string;
  dryRun: boolean;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { place: DEFAULT_PLACE_PATH, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--area' && value) { args.area = value; i += 1; }
    else if (flag === '--place' && value) { args.place = value; i += 1; }
    else if (flag === '--task-id' && value) { args.taskId = value; i += 1; }
    else if (flag === '--dry-run') args.dryRun = true;
  }
  return args;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new StageError('env', `${name} is not set`);
  return value;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await runWorkerOnce({
    apiBaseUrl: requireEnv('API_BASE_URL'),
    privateKey: requireEnv('CLI_WORKER_PRIVATE_KEY') as Hex,
    place: loadDemoPlace(args.place),
    ...(args.area ? { area: args.area } : {}),
    ...(args.taskId ? { taskId: args.taskId } : {}),
    dryRun: args.dryRun,
  });
  if (result.autoDisputeReason) {
    console.log(`AUTO-DISPUTED ${result.autoDisputeReason}`);
  }
}

/** Only when this file is the entry point: importing it from a test must run nothing. */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    if (error instanceof ClaimConflictError) {
      console.error(`CLAIM REFUSED: ${error.code}`);
      process.exit(1);
    }
    const stage = error instanceof StageError ? error.stage : 'worker';
    console.error(`FAILED ${stage}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
