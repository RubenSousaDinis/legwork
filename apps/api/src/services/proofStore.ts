/**
 * The private object store behind the three proof routes, and the routes themselves.
 *
 * ## Routes (T-18)
 *
 * `POST /proofs` — worker session, `multipart/form-data`, at most 8 MB.
 *   Fields: `file` (required), `lat`, `lon`, `accuracy_m`, `gps_unavailable`,
 *   `worker_confirmed_at_place`. The server hashes the bytes exactly as they arrived
 *   (`keccak256`) — that hash is what `submitFor` anchors onchain — then re-encodes the
 *   image so no metadata survives, writes both objects, and answers
 *   `{proofHash, url, captured_at}`. `captured_at` is server time; the client's clock is
 *   never trusted. The same bytes from the same worker return the existing row; the same
 *   hash from another worker is a 409.
 *
 * `GET /proofs/:hash?exp=&sig=` — no session, an HMAC and a deadline instead. Streams the
 *   stripped image as `image/jpeg`, `private, no-store`. Bad or expired signature is 403,
 *   unknown hash under a good signature is 404.
 *
 * `GET /public/proofs/:hash/verify` — public, 60 requests a minute per client. Re-hashes
 *   the retained original at request time so "hash matches onchain" is a check rather than
 *   decoration, and reports a coordinate only through `round100m`. Never the exact
 *   coordinate, never the worker, never a URL.
 *
 * ## The two objects
 *
 * `raw/<hash>`      the bytes as uploaded. Retained so `verify` can re-hash them and so a
 *                   dispute has the original. **No route serves this object.**
 * `img/<hash>.jpg`  the re-encoded copy, orientation applied, no metadata. The only object
 *                   any URL — the worker's or the buyer's — ever points at.
 *
 * Not IPFS, and not a public bucket: a public CID plus an intact EXIF block would be a
 * movement history for a real person keyed to a nullifier. The Supabase bucket is private
 * and reached with the service-role key, server-side only. There is no public fallback.
 *
 * GPS is self-reported and spoofable; we anchor it, geofence it, and dispute outside the
 * radius — we do not prove it.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { keccak256 } from 'viem';
import { getConfig } from '../config';
import { logger } from '../log';

export interface ProofStore {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
}

export const IMAGE_CONTENT_TYPE = 'image/jpeg';

/** The retained original. Never served — see the header. */
export function rawKey(hash: string): string {
  return `raw/${hash}`;
}

/** The stripped copy, and the only object a signed URL resolves to. */
export function imageKey(hash: string): string {
  return `img/${hash}.jpg`;
}

/** `keccak256` over a byte buffer, the same way the upload route hashes what it received. */
export function hashBytes(bytes: Buffer): string {
  return keccak256(new Uint8Array(bytes));
}

/**
 * Tests and local development. Holds objects for the life of the process and nothing
 * longer; `objects` is public so a test can corrupt one byte and watch `hash_ok` turn
 * false.
 */
export class MemoryProofStore implements ProofStore {
  readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { bytes: Buffer.from(bytes), contentType });
  }

  async get(key: string): Promise<Buffer | null> {
    return this.objects.get(key)?.bytes ?? null;
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
}

/** The private bucket. `upsert: false`: a hash is content-addressed, so a second write of
 * the same key is either a no-op or a mistake, and neither should overwrite evidence. */
export class SupabaseProofStore implements ProofStore {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(url: string, serviceRoleKey: string, bucket: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.bucket = bucket;
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(key, bytes, { contentType, upsert: false });
    if (error) throw error;
  }

  async get(key: string): Promise<Buffer | null> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  async exists(key: string): Promise<boolean> {
    const slash = key.lastIndexOf('/');
    const prefix = slash < 0 ? '' : key.slice(0, slash);
    const name = key.slice(slash + 1);
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .list(prefix, { search: name, limit: 1 });
    if (error || !data) return false;
    return data.some((entry) => entry.name === name);
  }
}

let store: ProofStore | undefined;

export function getProofStore(): ProofStore {
  if (store) return store;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PROOF_BUCKET } = getConfig();
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    store = new SupabaseProofStore(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PROOF_BUCKET);
  } else {
    // Local development with no Supabase project. Said out loud rather than silently
    // degrading, and never a public bucket standing in for a private one.
    logger.warn('no SUPABASE_URL — proof objects are held in this instance memory only');
    store = new MemoryProofStore();
  }
  return store;
}

/** Vitest only. */
export function setProofStoreForTests(next?: ProofStore): void {
  store = next;
}

export interface Rehash {
  /** `keccak256` of the retained original equals the hash it is filed under. */
  hash_ok: boolean;
  /** `keccak256` of the served image — a different number, and that is the point. */
  served_hash: string | null;
}

/**
 * Re-hashes both objects at request time. A client that fetches the signed URL and hashes
 * what it got matches `served_hash`, not `hash`: the served image is a re-encoded copy, so
 * the anchored hash can only be checked against the original the server kept.
 */
export async function rehash(hash: string): Promise<Rehash> {
  const proofStore = getProofStore();
  const [original, served] = await Promise.all([
    proofStore.get(rawKey(hash)),
    proofStore.get(imageKey(hash)),
  ]);
  return {
    hash_ok: original !== null && hashBytes(original) === hash,
    served_hash: served === null ? null : hashBytes(served),
  };
}
