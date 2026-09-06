/**
 * `POST /tasks` — the x402 seller. The handler is `hire()`; this file is the mount.
 *
 * **POST only.** The worker's board is `GET /tasks/list` (T-17) and lives in its own file so
 * that this one never grows a `GET`: two tasks in one route file is how a merge silently
 * reverts half a lane.
 */
import { route } from '@/src/http/route';
import { buildHireDeps, hire } from '@/src/services/hire';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Verify, screen, post and settle are four round trips; the Vercel ceiling is 60. */
export const maxDuration = 60;

export const POST = route(async (req) => hire(req, buildHireDeps()));
