/**
 * `GET /public/proofs/:hash/verify` — the check behind "hash matches onchain".
 *
 * The hash is re-computed from the retained original at request time, on every request. An
 * anchor nobody checks is decoration, and a boolean cached at upload time would only prove
 * that the server once believed itself.
 *
 * Two hashes come back and they differ on purpose. `hash` is the keccak256 of the bytes the
 * worker uploaded and the number the chain carries. `served_hash` is the keccak256 of the
 * image this API serves — a re-encoded copy with the metadata gone — so a client that
 * fetches the signed URL and hashes what it got can match *that* and understand why it is
 * not the anchored one.
 *
 * Public surface, so: a coordinate only ever through `round100m` (about 100 m), and never
 * the private one; never the worker; never a URL. GPS is self-reported and spoofable; we
 * anchor it, geofence it, and dispute outside the radius — we do not prove it.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/src/db/client';
import { proofs } from '@/src/db/schema';
import { pathParam, route } from '@/src/http/route';
import { clientKey, rateLimit } from '@/src/http/rateLimit';
import { round100m } from '@/src/services/geo';
import { getProofStore, imageKey, rehash } from '@/src/services/proofStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_LIMIT = { limit: 60, windowS: 60 };

interface VerifyResponse {
  hash: string;
  exists: boolean;
  hash_ok: boolean;
  captured_at: string | null;
  coordinate_rounded?: { lat: number; lon: number };
  gps_unavailable: boolean;
  /** Bytes of the served image — the object a client can fetch and compare. */
  size_bytes: number;
  served_hash: string | null;
}

export const GET = route(async (req, ctx) => {
  rateLimit(`proofs-verify:${clientKey(req)}`, RATE_LIMIT);

  const hash = await pathParam(ctx, 'hash');
  const rows = await getDb().select().from(proofs).where(eq(proofs.hash, hash)).limit(1);
  const row = rows[0];

  if (!row) {
    const absent: VerifyResponse = {
      hash,
      exists: false,
      hash_ok: false,
      captured_at: null,
      gps_unavailable: false,
      size_bytes: 0,
      served_hash: null,
    };
    return Response.json(absent);
  }

  const [{ hash_ok, served_hash }, served] = await Promise.all([
    rehash(hash),
    getProofStore().get(imageKey(hash)),
  ]);

  const body: VerifyResponse = {
    hash,
    exists: true,
    hash_ok,
    captured_at: row.capturedAt.toISOString(),
    gps_unavailable: row.gpsUnavailable,
    size_bytes: served?.byteLength ?? 0,
    served_hash,
  };

  // The private coordinate never leaves the row; only its rounded form is assembled here.
  if (row.exactLat !== null && row.exactLon !== null) {
    body.coordinate_rounded = round100m(Number(row.exactLat), Number(row.exactLon));
  }

  return Response.json(body);
});
