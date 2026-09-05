// OWNER: T-19
/** The last 20 tasks, newest first. What the dashboard's feed column reads. */
import { desc } from 'drizzle-orm';
import { route, preflight } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { getDb } from '@/src/db/client';
import { tasks } from '@/src/db/schema';
import { readProof } from '@/src/services/statusBus';
import { PUBLIC_RATE_LIMIT, publicJson, publicTaskView } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FEED_SIZE = 20;

export const GET = route(async (req) => {
  rateLimit(`public:${clientKey(req)}`, PUBLIC_RATE_LIMIT);

  const db = getDb();
  const rows = await db.select().from(tasks).orderBy(desc(tasks.postedAt)).limit(FEED_SIZE);

  const views = await Promise.all(
    rows.map(async (row) =>
      publicTaskView(row, row.proofHash ? ((await readProof(db, row.proofHash)) ?? null) : null),
    ),
  );

  return publicJson({ tasks: views });
});

export const OPTIONS = preflight;
