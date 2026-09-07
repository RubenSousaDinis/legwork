// OWNER: T-30 — replace this file; do not edit from any other task
/**
 * One row per screening decision — accepted, refused or schema-rejected — and never the
 * words that were screened.
 *
 * `screening_log` is what the dashboard (T-26) and `/public/refusals` (T-19) read, so it is
 * a public surface in everything but name. It carries the class, the rule id and the
 * `spec_hash`; the spec text, the envelope and any coordinate stay in the private task
 * record. `reason` is the gate's own sentence, which is why the guard below rejects
 * anything shaped like pasted spec text rather than trusting the caller to have passed one.
 */
import { randomUUID } from 'node:crypto';
import type { AbuseClass } from '@legwork/shared';
import { screeningLog } from '../db/schema';
import { defaultDeps, type ServiceDeps } from './identity';

export { defaultDeps, type ServiceDeps } from './identity';

/**
 * Exactly the columns of `screening_log`, and nothing else — no `spec`, no `envelope`, no
 * coordinate. `agent_id` is the **verified** id or `null`; `payer` is `null` for the rows
 * `POST /check` writes, because a free dry run has no payer.
 */
export interface ScreeningEntry {
  /** Defaults to `deps.now()`. */
  at?: Date;
  task_type: string;
  class: AbuseClass | null;
  reason: string;
  rule_id: string;
  spec_hash: string;
  marked: boolean;
  mark_tx: string | null;
  agent_id: string | null;
  payer: string | null;
}

/** What an accepted decision logs. Named so the three callers cannot each invent their own. */
export const ACCEPTED_REASON = 'accepted';
export const ACCEPTED_RULE_ID = 'accept';

/** The gate's sentences are short, single-line prose. Spec text is not. */
const MAX_REASON_LENGTH = 200;

const REASON_GUARD = 'screening_log.reason must be the gate sentence, not spec text';

/**
 * A newline or a `{` means somebody handed this the envelope; over 200 characters means
 * somebody handed it the spec. Both throw before the insert, so nothing is written — a
 * half-written privacy leak is worse than a failed request.
 */
function assertReason(reason: string): void {
  if (reason.length > MAX_REASON_LENGTH || reason.includes('\n') || reason.includes('{')) {
    throw new TypeError(REASON_GUARD);
  }
}

export async function logScreening(entry: ScreeningEntry, deps?: ServiceDeps): Promise<void> {
  assertReason(entry.reason);
  const d = deps ?? defaultDeps();
  await d.db.insert(screeningLog).values({
    id: randomUUID(),
    at: entry.at ?? d.now(),
    taskType: entry.task_type,
    class: entry.class,
    reason: entry.reason,
    ruleId: entry.rule_id,
    specHash: entry.spec_hash,
    marked: entry.marked,
    markTx: entry.mark_tx,
    agentId: entry.agent_id,
    payer: entry.payer,
  });
}
