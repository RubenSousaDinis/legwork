/**
 * `POST /proofs` — the same-origin upload the mini-app calls before it submits.
 *
 * The order in here is the whole point: hash the bytes as they arrived, *then* re-encode
 * them. `proofHash` is what `submitFor` anchors onchain, so it can only ever be the
 * keccak256 of what the worker's phone sent — never of the stripped copy, never of a
 * resized one.
 *
 * GPS is self-reported and spoofable; we anchor it, geofence it, and dispute outside the
 * radius — we do not prove it. What this route does is record it privately, exactly once,
 * against the worker who uploaded the photo.
 */
import { eq } from 'drizzle-orm';
import { keccak256 } from 'viem';
import { z } from 'zod';
import { getDb } from '@/src/db/client';
import { proofs } from '@/src/db/schema';
import { ApiError } from '@/src/errors';
import { route } from '@/src/http/route';
import { childLogger } from '@/src/log';
import { requireWorkerSession } from '@/src/session';
import { sniffImageType, stripImage } from '@/src/services/exif';
import {
  IMAGE_CONTENT_TYPE,
  getProofStore,
  imageKey,
  rawKey,
} from '@/src/services/proofStore';
import { WORKER_URL_TTL_S, signProofUrl } from '@/src/services/signedUrl';

/** sharp decodes and re-encodes up to 8 MB on this path, so it needs the Node runtime. */
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const Gps = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  accuracy_m: z.coerce.number().min(0).optional(),
});

/** A multipart field is either absent or a string; `''` is how a browser sends "unset". */
function field(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function flag(form: FormData, name: string): boolean | undefined {
  const value = field(form, name);
  if (value === undefined) return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw ApiError.of('invalid_request', { field: name, reason: 'expected_boolean' });
}

const invalidGps = () => ApiError.of('invalid_request', { field: 'gps', reason: 'gps_invariant' });

interface ParsedGps {
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  gpsUnavailable: boolean;
}

/**
 * The invariant, in one place: `gps === null` if and only if `gps_unavailable === true`.
 * Either a fix — both components, no `gps_unavailable` — or no fix at all, declared, with
 * the worker confirming by hand that they are at the place. Half of either is a 400.
 */
function parseGps(form: FormData): ParsedGps {
  const lat = field(form, 'lat');
  const lon = field(form, 'lon');
  const gpsUnavailable = flag(form, 'gps_unavailable') ?? false;
  const confirmed = flag(form, 'worker_confirmed_at_place') ?? false;

  if (lat !== undefined && lon !== undefined) {
    if (gpsUnavailable) throw invalidGps();
    const parsed = Gps.parse({ lat, lon, accuracy_m: field(form, 'accuracy_m') });
    return {
      lat: parsed.lat,
      lon: parsed.lon,
      accuracyM: parsed.accuracy_m ?? null,
      gpsUnavailable: false,
    };
  }

  if (lat !== undefined || lon !== undefined) throw invalidGps();
  if (!gpsUnavailable || !confirmed) throw invalidGps();
  return { lat: null, lon: null, accuracyM: null, gpsUnavailable: true };
}

/**
 * A body that will not parse as multipart carries no image at all, which is the same thing
 * the caller has to fix: send an image.
 */
async function readForm(req: Request): Promise<FormData> {
  try {
    return await req.formData();
  } catch {
    throw ApiError.of('invalid_request', { field: 'file', reason: 'unsupported_type' });
  }
}

export const POST = route(async (req) => {
  const session = await requireWorkerSession(req);
  const form = await readForm(req);

  const file = form.get('file');
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    throw ApiError.of('invalid_request', { field: 'file', reason: 'required' });
  }
  // 413 with the ceiling, the contract's generic error: a client learns the limit from the answer.
  if (file.size > MAX_UPLOAD_BYTES) {
    throw ApiError.of('payload_too_large', { max_bytes: MAX_UPLOAD_BYTES });
  }

  const raw = Buffer.from(await file.arrayBuffer());
  if (raw.byteLength > MAX_UPLOAD_BYTES) {
    throw ApiError.of('payload_too_large', { max_bytes: MAX_UPLOAD_BYTES });
  }
  if (sniffImageType(raw) === undefined) {
    throw ApiError.of('invalid_request', { field: 'file', reason: 'unsupported_type' });
  }

  const gps = parseGps(form);

  // Before any decoding: this is the number the chain will carry.
  const proofHash = keccak256(new Uint8Array(raw));
  const log = childLogger({ route: '/proofs' });

  const db = getDb();
  const existing = await db.select().from(proofs).where(eq(proofs.hash, proofHash)).limit(1);
  const previous = existing[0];
  if (previous) {
    if (previous.worker.toLowerCase() !== session.worker.toLowerCase()) {
      throw ApiError.of('conflict', { reason: 'hash_owned_by_other_worker' });
    }
    // The same photo uploaded twice is the same proof, not a second one.
    return Response.json({
      proofHash,
      url: signProofUrl(proofHash, nowS() + WORKER_URL_TTL_S),
      captured_at: previous.capturedAt.toISOString(),
    });
  }

  const stripped = await stripImage(raw);
  const store = getProofStore();
  await store.put(rawKey(proofHash), raw, 'application/octet-stream');
  await store.put(imageKey(proofHash), stripped.bytes, IMAGE_CONTENT_TYPE);

  // Server time. A capture timestamp from the client is a claim, and it is not stored.
  const capturedAt = new Date();
  await db.insert(proofs).values({
    hash: proofHash,
    storageKey: imageKey(proofHash),
    capturedAt,
    exactLat: gps.lat === null ? null : String(gps.lat),
    exactLon: gps.lon === null ? null : String(gps.lon),
    exactAccuracyM: gps.accuracyM === null ? null : String(gps.accuracyM),
    gpsUnavailable: gps.gpsUnavailable,
    worker: session.worker,
    // T-17 fills both of these when the proof is attached to a submit.
    taskId: null,
    placeId: null,
  });

  // The hash, the size and the worker. Never a coordinate.
  log.info(
    { hash: proofHash, size_bytes: raw.byteLength, worker: session.worker },
    'proof stored',
  );

  return Response.json({
    proofHash,
    url: signProofUrl(proofHash, nowS() + WORKER_URL_TTL_S),
    captured_at: capturedAt.toISOString(),
  });
});

function nowS(): number {
  return Math.floor(Date.now() / 1000);
}
