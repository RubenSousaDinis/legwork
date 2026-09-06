// OWNER: T-19
/** One task, as a stranger sees it. Never the spec, never an exact coordinate, never a URL. */
import { route, preflight, pathParam } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { getDb } from '@/src/db/client';
import { fail, readProof, readTask } from '@/src/services/statusBus';
import { PUBLIC_RATE_LIMIT, publicJson, publicTaskView } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req, ctx) => {
  rateLimit(`public:${clientKey(req)}`, PUBLIC_RATE_LIMIT);

  const raw = await pathParam(ctx, 'id');
  if (!/^\d+$/.test(raw)) return fail(404, { error: 'not_found' });

  const db = getDb();
  const row = await readTask(db, BigInt(raw));
  if (!row) return fail(404, { error: 'not_found' });

  const proofRow = row.proofHash ? ((await readProof(db, row.proofHash)) ?? null) : null;
  return publicJson(await publicTaskView(row, proofRow));
});

export const OPTIONS = preflight;
