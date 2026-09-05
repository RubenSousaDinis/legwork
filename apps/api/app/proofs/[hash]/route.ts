/**
 * `GET /proofs/:hash?exp=&sig=` — the only way a proof image leaves the private bucket.
 *
 * No session: the signature *is* the authorisation, and it expires. The worker's own URL
 * lasts one hour; a buyer's lasts the dispute window plus an hour and is minted by T-19.
 * A URL past its deadline, or one with a digit changed, is a 403 — not a 404, because the
 * caller's problem is the credential and not the resource.
 *
 * Only the stripped copy is addressable here. The retained original has no route at all.
 */
import { ApiError } from '@/src/errors';
import { pathParam, route } from '@/src/http/route';
import { getProofStore, imageKey } from '@/src/services/proofStore';
import { verifyProofUrl } from '@/src/services/signedUrl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req, ctx) => {
  const hash = await pathParam(ctx, 'hash');
  const params = new URL(req.url).searchParams;
  const nowS = Math.floor(Date.now() / 1000);

  if (!verifyProofUrl(hash, params.get('exp'), params.get('sig'), nowS)) {
    throw ApiError.of('forbidden');
  }

  const bytes = await getProofStore().get(imageKey(hash));
  if (!bytes) throw ApiError.of('not_found');

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'content-type': 'image/jpeg',
      'content-length': String(bytes.byteLength),
      'cache-control': 'private, no-store',
    },
  });
});
