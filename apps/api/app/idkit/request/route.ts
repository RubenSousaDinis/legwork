/**
 * The RP-signed request the mini-app hands to IDKit.
 *
 * Public, because a worker has no session until this round trip is over. The signing key
 * stays in `worldId.ts`; what comes back here is a nonce, two timestamps and a signature.
 */
import { z } from 'zod';
import { route, preflight } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { ApiError } from '@/src/errors';
import { getConfig } from '@/src/config';
import { signRpRequest } from '@/src/services/worldId';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ action: z.string().min(1) });

export const POST = route(async (req) => {
  rateLimit(`idkit-request:${clientKey(req)}`, { limit: 30, windowS: 60 });

  const raw = await req.json().catch(() => {
    throw ApiError.of('invalid_request', { field: '(root)', reason: 'expected a JSON body' });
  });
  const body = Body.parse(raw);

  // One action, signed one way. An RP signature over somebody else's action is a request
  // this app would have no way to check the proof against later.
  if (body.action !== getConfig().WORLD_ACTION) {
    throw ApiError.of('invalid_request', { field: 'action', reason: 'unknown_action' });
  }

  return Response.json({ rp_context: signRpRequest(body.action) });
});

export const OPTIONS = preflight;
