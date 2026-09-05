import { route, preflight } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { issueNonce } from '@/src/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A nonce is cheap but not free: it writes a row, so the window keeps a loop honest. */
export const GET = route(async (req) => {
  rateLimit(`session-nonce:${clientKey(req)}`, { limit: 30, windowS: 60 });
  return Response.json({ nonce: await issueNonce() });
});

export const OPTIONS = preflight;
