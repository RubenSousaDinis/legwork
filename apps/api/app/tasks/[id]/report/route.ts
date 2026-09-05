/**
 * `POST /tasks/:id/report` — the worker says this errand is one of the six abuse classes.
 *
 * It records and it never marks. A mark is a permanent public record against a named agent,
 * and one worker's tap is not evidence enough to write one: the row is disclosed on the
 * dashboard beside the gate's own decisions, `marked: false`, for a human to read.
 */
import { randomUUID } from 'node:crypto';
import { ABUSE_CLASSES } from '@legwork/shared';
import { z } from 'zod';
import { route, preflight, pathParam } from '@/src/http/route';
import { ApiError } from '@/src/errors';
import { getDb } from '@/src/db/client';
import { screeningLog } from '@/src/db/schema';
import { requireWorkerSession } from '@/src/session';
import { loadTask, taskTypeOf } from '@/src/services/lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TaskId = /^\d+$/;
const Body = z.object({ class: z.enum(ABUSE_CLASSES) });

export const POST = route(async (req, ctx) => {
  await requireWorkerSession(req);
  const id = await pathParam(ctx, 'id');
  if (!TaskId.test(id)) throw ApiError.of('not_found');

  const raw = await req.json().catch(() => {
    throw ApiError.of('invalid_request', { field: '(root)', reason: 'expected a JSON body' });
  });
  const body = Body.parse(raw);

  const row = await loadTask(BigInt(id));

  // `spec_hash`, never the spec. The log line names the task, not what the buyer wrote in it.
  await getDb().insert(screeningLog).values({
    id: randomUUID(),
    taskType: taskTypeOf(row.taskType),
    class: body.class,
    reason: 'worker report',
    ruleId: 'worker-report',
    specHash: row.specHash,
    marked: false,
  });

  return Response.json({ recorded: true });
});

export const OPTIONS = preflight;
