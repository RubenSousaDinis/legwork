import { route, preflight } from '@/src/http/route';
import { requireWorkerSession, revokeWorkerSession } from '@/src/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Clears the worker-session cookie and deletes the sessions row. A logout that leaves a
 * usable cookie is not a logout.
 */
export const POST = route(async (req) => {
  const session = await requireWorkerSession(req);
  const cookie = await revokeWorkerSession(session);
  return new Response(null, { status: 204, headers: { 'set-cookie': cookie } });
});

export const OPTIONS = preflight;
