// OWNER: T-19
/**
 * The refusal counter, in public.
 *
 * The six classes are always all six, zero-filled: a class that has never fired is a fact
 * about the gate, and hiding it would make the wall look busier than the system is. `recent`
 * carries no `reason`, no `spec_hash`, no `agent_id` and no `payer` — a refusal log that
 * quoted the spec back would publish exactly the text the gate refused to run.
 */
import { desc, isNotNull, sql } from 'drizzle-orm';
import { ABUSE_CLASSES, DemoData, type AbuseClass } from '@legwork/shared';
import { route, preflight } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { getDb } from '@/src/db/client';
import { screeningLog } from '@/src/db/schema';
import { PUBLIC_RATE_LIMIT, publicJson } from '../_shared';
import demoDataJson from '../../../../../demo-data.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RECENT_SIZE = 20;

/** The demo rows are parsed, not trusted: a malformed `demo-data.json` fails here, loudly. */
const demo = DemoData.parse(demoDataJson);

export const GET = route(async (req) => {
  rateLimit(`public:${clientKey(req)}`, PUBLIC_RATE_LIMIT);

  const db = getDb();

  const counted = await db
    .select({ class: screeningLog.class, count: sql<number>`count(*)::int` })
    .from(screeningLog)
    .where(isNotNull(screeningLog.class))
    .groupBy(screeningLog.class);

  const byClass = new Map<string, number>(
    counted.map((r) => [String(r.class), Number(r.count)]),
  );
  const classes = ABUSE_CLASSES.map((name) => ({ class: name, count: byClass.get(name) ?? 0 }));

  const recentRows = await db
    .select({
      at: screeningLog.at,
      task_type: screeningLog.taskType,
      class: screeningLog.class,
      rule_id: screeningLog.ruleId,
      marked: screeningLog.marked,
    })
    .from(screeningLog)
    .where(isNotNull(screeningLog.class))
    .orderBy(desc(screeningLog.at))
    .limit(RECENT_SIZE);

  const recent = recentRows.map((r) => ({
    at: r.at.toISOString(),
    task_type: r.task_type,
    class: r.class as AbuseClass,
    rule_id: r.rule_id,
    marked: r.marked,
  }));

  // Labelled `example: true` so the wall can never pass a demo row off as something the
  // gate refused today.
  const examples = demo.feed
    .filter((row) => row.refusal_class !== undefined)
    .map((row) => ({
      task_type: row.task_type,
      class: row.refusal_class as AbuseClass,
      reason: 'example refusal carried in demo-data.json',
      rule_id: 'demo.example',
      example: true as const,
    }));

  return publicJson({ classes, recent, examples });
});

export const OPTIONS = preflight;
