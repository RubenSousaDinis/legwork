/**
 * The `/proofs` unit test.
 *
 * Every fixture is generated here with sharp — including the EXIF block, the GPS tags and
 * the orientation flag — so nothing binary is committed and the "before" state of a photo
 * is readable in the diff.
 */
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { keccak256 } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config';
import { resetRateLimitForTests } from '../../src/http/rateLimit';
import { issueWorkerSession, WORKER_COOKIE } from '../../src/session';
import { assertNoMetadata } from '../../src/services/exif';
import { round100m } from '../../src/services/geo';
import {
  MemoryProofStore,
  imageKey,
  rawKey,
  setProofStoreForTests,
} from '../../src/services/proofStore';
import { signProofUrl } from '../../src/services/signedUrl';
import { createTestDb, type TestDb } from '../../test/db';
import { GET as getVerify } from '../public/proofs/[hash]/verify/route';
import { GET as getImage } from './[hash]/route';
import { MAX_UPLOAD_BYTES, POST as postProof } from './route';

const API_BASE_URL = 'http://localhost';
const WORKER = '0x1111111111111111111111111111111111111111';
const OTHER_WORKER = '0x2222222222222222222222222222222222222222';
const LISBON = { lat: 39.74362, lon: -8.80713 };

let fixture: TestDb;
let store: MemoryProofStore;
let cookie: string;

/** A JPEG carrying everything a phone would attach: a device id, a GPS fix, an orientation. */
async function exifFixture(width = 64, height = 32): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#888888' } })
    .jpeg()
    .withMetadata({
      exif: {
        IFD0: { Make: 'Legwork-Test', Software: 'fixture' },
        // IFD3 is the GPS directory: a five-metre fix, which is the whole reason for this test.
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '39/1 44/1 37/1' },
      },
      orientation: 6,
    })
    .toBuffer();
}

async function pngFixture(): Promise<Buffer> {
  return sharp({ create: { width: 48, height: 24, channels: 3, background: '#123456' } })
    .png()
    .toBuffer();
}

interface UploadFields {
  lat?: string;
  lon?: string;
  accuracy_m?: string;
  gps_unavailable?: string;
  worker_confirmed_at_place?: string;
}

async function upload(
  bytes: Buffer | undefined,
  fields: UploadFields = {},
  options: { contentType?: string; filename?: string; sessionCookie?: string } = {},
): Promise<Response> {
  const form = new FormData();
  if (bytes) {
    const blob = new Blob([new Uint8Array(bytes)], { type: options.contentType ?? 'image/jpeg' });
    form.append('file', blob, options.filename ?? 'proof.jpg');
  }
  for (const [key, value] of Object.entries(fields)) form.append(key, value);

  const req = new Request(`${API_BASE_URL}/proofs`, {
    method: 'POST',
    body: form,
    headers: { cookie: options.sessionCookie ?? cookie },
  });
  return postProof(req, { params: Promise.resolve({}) });
}

async function uploadOk(bytes: Buffer, fields: UploadFields = {}) {
  const res = await upload(bytes, fields);
  expect(res.status).toBe(200);
  return (await res.json()) as { proofHash: string; url: string; captured_at: string };
}

async function verify(hash: string) {
  const res = await getVerify(new Request(`${API_BASE_URL}/public/proofs/${hash}/verify`), {
    params: Promise.resolve({ hash }),
  });
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as Record<string, unknown> };
}

/** Calls the image route the way the signed URL addresses it. */
async function fetchSigned(url: string, hash: string): Promise<Response> {
  const absolute = new URL(url, API_BASE_URL);
  return getImage(new Request(absolute), { params: Promise.resolve({ hash }) });
}

async function sessionCookieFor(worker: string): Promise<string> {
  const issued = await issueWorkerSession({ worker, nullifier: '1234567890', mode: 'dev' });
  return `${WORKER_COOKIE}=${issued.token}`;
}

beforeEach(async () => {
  resetConfigForTests({ API_BASE_URL });
  resetRateLimitForTests();
  fixture = await createTestDb();
  store = new MemoryProofStore();
  setProofStoreForTests(store);
  cookie = await sessionCookieFor(WORKER);
});

afterEach(async () => {
  setProofStoreForTests(undefined);
  await fixture.close();
});

describe('/proofs unit test', () => {
  it('stripsExif', async () => {
    const raw = await exifFixture(64, 32);
    const before = await sharp(raw).metadata();
    expect(before.orientation).toBe(6);
    expect(before.exif?.toString('latin1')).toContain('Legwork-Test');

    const { proofHash } = await uploadOk(raw, { lat: '39.74362', lon: '-8.80713' });

    const stored = store.objects.get(imageKey(proofHash))?.bytes;
    expect(stored).toBeDefined();
    const after = await sharp(stored!).metadata();
    expect(after.exif).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    await expect(assertNoMetadata(stored!)).resolves.toBeUndefined();

    // orientation 6 is a quarter turn, so the stripped copy is 32x64 where the fixture was 64x32.
    expect({ width: after.width, height: after.height }).toEqual({ width: 32, height: 64 });

    // The original is kept byte for byte — it is what `hash_ok` is checked against.
    expect(store.objects.get(rawKey(proofHash))?.bytes.equals(raw)).toBe(true);
  });

  it('proofHashIsKeccakOfUploadedBytes', async () => {
    const raw = await exifFixture();
    const { proofHash } = await uploadOk(raw, { lat: '39.74362', lon: '-8.80713' });

    expect(proofHash).toBe(keccak256(new Uint8Array(raw)));

    const stored = store.objects.get(imageKey(proofHash))!.bytes;
    const storedHash = keccak256(new Uint8Array(stored));
    expect(storedHash).not.toBe(proofHash);

    const first = await verify(proofHash);
    expect(first.body.hash_ok).toBe(true);
    expect(first.body.served_hash).toBe(storedHash);
    expect(first.body.exists).toBe(true);
    expect(first.body.size_bytes).toBe(stored.byteLength);

    // One byte of the retained original, changed underneath the row: the check has to notice.
    const original = store.objects.get(rawKey(proofHash))!.bytes;
    original.writeUInt8(original.readUInt8(0) ^ 0xff, 0);
    const second = await verify(proofHash);
    expect(second.body.hash_ok).toBe(false);
    expect(second.body.served_hash).toBe(storedHash);
  });

  it('signedUrlExpiryAndTamper', async () => {
    const raw = await exifFixture();
    const { proofHash, url } = await uploadOk(raw, { gps_unavailable: 'true', worker_confirmed_at_place: 'true' });

    const parsed = new URL(url, API_BASE_URL);
    expect(parsed.pathname).toBe(`/proofs/${proofHash}`);
    const exp = Number(parsed.searchParams.get('exp'));
    const sig = parsed.searchParams.get('sig')!;
    // One hour, not the dispute window: the worker's own URL is for finishing a submit.
    expect(exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(3500);
    expect(exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(3600);

    const ok = await fetchSigned(url, proofHash);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/jpeg');
    expect(ok.headers.get('cache-control')).toBe('private, no-store');
    const served = Buffer.from(await ok.arrayBuffer());
    expect(served.equals(store.objects.get(imageKey(proofHash))!.bytes)).toBe(true);
    expect(served.equals(raw)).toBe(false);

    const expired = signProofUrl(proofHash, Math.floor(Date.now() / 1000) - 1);
    expect((await fetchSigned(expired, proofHash)).status).toBe(403);

    const flipped = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
    const tampered = `${API_BASE_URL}/proofs/${proofHash}?exp=${exp}&sig=${flipped}`;
    expect((await fetchSigned(tampered, proofHash)).status).toBe(403);

    const extended = `${API_BASE_URL}/proofs/${proofHash}?exp=${exp + 100_000}&sig=${sig}`;
    expect((await fetchSigned(extended, proofHash)).status).toBe(403);

    // No signature reaches the retained original: the route resolves a hash to the stripped
    // copy and to nothing else, so even a validly signed request naming that key is a 404.
    const originalKey = rawKey(proofHash);
    const signedOriginal = signProofUrl(originalKey, Math.floor(Date.now() / 1000) + 3600);
    const attempt = await fetchSigned(signedOriginal, originalKey);
    expect(attempt.status).toBe(404);
  });

  it('round100mVector', async () => {
    expect(round100m(LISBON.lat, LISBON.lon)).toEqual({ lat: 39.744, lon: -8.807 });

    const raw = await exifFixture();
    const { proofHash } = await uploadOk(raw, {
      lat: String(LISBON.lat),
      lon: String(LISBON.lon),
      accuracy_m: '12',
    });

    const { body, text } = await verify(proofHash);
    expect(body.coordinate_rounded).toEqual({ lat: 39.744, lon: -8.807 });
    expect(text).not.toContain('39.74362');
    expect(text).not.toContain('-8.80713');
    expect(text).not.toContain(WORKER);
  });

  it('gpsInvariant', async () => {
    const raw = await exifFixture();

    const latOnly = await upload(raw, { lat: '39.74362' });
    expect(latOnly.status).toBe(400);
    expect(await latOnly.json()).toMatchObject({ error: 'invalid_request', field: 'gps' });

    const unconfirmed = await upload(raw, { gps_unavailable: 'true' });
    expect(unconfirmed.status).toBe(400);
    expect(await unconfirmed.json()).toMatchObject({ error: 'invalid_request', field: 'gps' });

    const both = await upload(raw, {
      lat: '39.74362',
      lon: '-8.80713',
      gps_unavailable: 'true',
    });
    expect(both.status).toBe(400);
    expect(await both.json()).toMatchObject({ error: 'invalid_request', field: 'gps' });

    const { proofHash } = await uploadOk(raw, {
      gps_unavailable: 'true',
      worker_confirmed_at_place: 'true',
    });
    const rows = await fixture.rawQuery(
      'select exact_lat, exact_lon, gps_unavailable from proofs where hash = $1',
      [proofHash],
    );
    expect(rows[0]).toMatchObject({ exact_lat: null, exact_lon: null, gps_unavailable: true });
  });

  it('sizeAndTypeLimits', async () => {
    const tooLarge = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0xff);
    const overSize = await upload(tooLarge, { gps_unavailable: 'true', worker_confirmed_at_place: 'true' });
    expect(overSize.status).toBe(400);
    expect(await overSize.json()).toMatchObject({ field: 'file', reason: 'too_large' });

    const text = await upload(Buffer.from('not an image, just words'), {
      gps_unavailable: 'true',
      worker_confirmed_at_place: 'true',
    }, { contentType: 'text/plain', filename: 'note.txt' });
    expect(text.status).toBe(400);
    expect(await text.json()).toMatchObject({ field: 'file', reason: 'unsupported_type' });

    // A body that is not multipart at all lands on the same answer: send an image.
    const notMultipart = await postProof(
      new Request(`${API_BASE_URL}/proofs`, {
        method: 'POST',
        body: 'not an image, just words',
        headers: { cookie, 'content-type': 'text/plain' },
      }),
      { params: Promise.resolve({}) },
    );
    expect(notMultipart.status).toBe(400);
    expect(await notMultipart.json()).toMatchObject({ field: 'file', reason: 'unsupported_type' });

    const png = await pngFixture();
    const { proofHash } = await uploadOk(png, {
      gps_unavailable: 'true',
      worker_confirmed_at_place: 'true',
    });
    const stored = store.objects.get(imageKey(proofHash))!.bytes;
    expect((await sharp(stored).metadata()).format).toBe('jpeg');
    expect(store.objects.get(rawKey(proofHash))!.bytes.equals(png)).toBe(true);
  });

  it('is idempotent for one worker and a conflict for another', async () => {
    const raw = await exifFixture();
    const first = await uploadOk(raw, { lat: '39.74362', lon: '-8.80713' });
    const again = await uploadOk(raw, { lat: '39.74362', lon: '-8.80713' });
    expect(again.proofHash).toBe(first.proofHash);
    expect(again.captured_at).toBe(first.captured_at);

    const stranger = await upload(raw, { lat: '39.74362', lon: '-8.80713' }, {
      sessionCookie: await sessionCookieFor(OTHER_WORKER),
    });
    expect(stranger.status).toBe(409);
    expect(await stranger.json()).toMatchObject({
      error: 'conflict',
      reason: 'hash_owned_by_other_worker',
    });
  });

  it('needs a worker session and answers a request without one with a 401', async () => {
    const raw = await exifFixture();
    const res = await upload(raw, { lat: '39.74362', lon: '-8.80713' }, { sessionCookie: '' });
    expect(res.status).toBe(401);
  });

  it('reports an unknown hash as not stored rather than as a proof', async () => {
    const { body } = await verify(`0x${'ab'.repeat(32)}`);
    expect(body).toMatchObject({ exists: false, hash_ok: false, served_hash: null });
    expect(body.coordinate_rounded).toBeUndefined();
  });
});
