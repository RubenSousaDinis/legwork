import { z } from 'zod';
import type { AbuseClass } from '@legwork/shared';
import { ABUSE_CLASSES, TASK_STATE_NAMES } from '@legwork/shared';

/**
 * The rows the subgraph returns, one schema per entity in the frozen
 * `subgraph/schema.graphql`. `BigInt!` arrives over the wire as a decimal string and
 * stays one here — a task id or a unix second is not a JavaScript number.
 *
 * The schema is quoted, never redefined: these are the field names the index already
 * has, and nothing in this package invents a field the subgraph cannot answer for.
 */

export const WorkerRowSchema = z.object({
  id: z.string(),
  seeded: z.boolean(),
  reset: z.boolean(),
  area: z.string(),
  taskTypes: z.number().int(),
  completed: z.number().int(),
  lastCompletedAt: z.string().nullable(),
  score: z.string(),
  distinctRaters: z.number().int(),
  registeredAt: z.string(),
});
export type WorkerRow = z.infer<typeof WorkerRowSchema>;

export const BuyerRefSchema = z.object({
  id: z.string(),
  allowlisted: z.boolean(),
});
export type BuyerRef = z.infer<typeof BuyerRefSchema>;

export const TaskRowSchema = z.object({
  id: z.string(),
  taskType: z.number().int(),
  specHash: z.string(),
  amount: z.string(),
  fee: z.string(),
  buyer: BuyerRefSchema,
  buyerAgentId: z.string(),
  worker: z.object({ id: z.string(), seeded: z.boolean() }).nullable(),
  state: z.enum(TASK_STATE_NAMES),
  area: z.string(),
  postedAt: z.string(),
  claimedAt: z.string().nullable(),
  submittedAt: z.string().nullable(),
  releasedAt: z.string().nullable(),
  proofHash: z.string().nullable(),
  seeded: z.boolean(),
  txPost: z.string(),
  txClaim: z.string().nullable(),
  txSubmit: z.string().nullable(),
  txRelease: z.string().nullable(),
});
export type TaskRow = z.infer<typeof TaskRowSchema>;

export const PosterStatsRowSchema = z.object({
  id: z.string(),
  distinctExternalBuyers: z.number().int(),
  externalTasks: z.number().int(),
});
export type PosterStatsRow = z.infer<typeof PosterStatsRowSchema>;

/** A `Mark` as indexed, plus the label the client attaches from the shared enum. */
export const MarkRowSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  classId: z.number().int(),
  specHash: z.string(),
  at: z.string(),
  tx: z.string(),
  abuseClass: z.enum(ABUSE_CLASSES),
});
export type MarkRow = z.infer<typeof MarkRowSchema> & { abuseClass: AbuseClass };

/** What `activeWorkers` answers with, before T-27 adds `score_floor` and `dashboard_url`. */
export interface PreflightCounts {
  active: number;
  verified: number;
  seeded: number;
  median_minutes: number | null;
  median_source: 'real' | 'seeded' | 'n/a';
  n_real: number;
}

/** The two lists a preflight reduces over: the candidate workers and their released tasks. */
export interface PreflightSource {
  workers: WorkerRow[];
  tasks: TaskRow[];
}
