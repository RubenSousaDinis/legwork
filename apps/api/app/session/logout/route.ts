import { route, preflight } from '@/src/http/route';
import {
  SELFIE_COOKIE,
  clearCookie,
  requireWorkerSession,
  revokeWorkerSession,
} from '@/src/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Clears the worker-session cookie and deletes the sessions row. A logout that leaves a
 * usable cookie is not a logout.
 */
export const POST = route(async (req) => {
  const session = await requireWorkerSession(req);
  const workerCookie = await revokeWorkerSession(session);
  const headers = new Headers();
  headers.append('set-cookie', workerCookie);
  headers.append('set-cookie', clearCookie(SELFIE_COOKIE));
  return new Response(null, { status: 204, headers });
});

export const OPTIONS = preflight;
