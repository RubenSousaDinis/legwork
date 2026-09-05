import { z } from 'zod';
import { ABUSE_CLASSES, TASK_TYPES } from '../enums';
import { NO_RETRY_SENTENCE } from '../constants';

/**
 * A refusal in one of the six abuse classes. The only shape that ever marks an agent.
 * `class: null` is a refusal that is not one of the six (e.g. region not covered) and
 * never marks. `message` is the fixed no-retry sentence.
 */
export const RefusalPayload = z.object({
  refused: z.literal(true),
  class: z.enum(ABUSE_CLASSES).nullable(),
  reason: z.string().max(300),
  rule_id: z.string().max(64),
  retryable: z.literal(false),
  allowed_task_types: z.array(z.enum(TASK_TYPES)),
  mark_tx: z.string().regex(/^0x[0-9a-f]{64}$/).optional(),
  mark_status: z.enum(['marked', 'logged, cooldown', 'no identity']).optional(),
  message: z.literal(NO_RETRY_SENTENCE),
});
export type RefusalPayload = z.infer<typeof RefusalPayload>;

/** A plain schema/shape failure: 400, never marks, never counts as a refusal. */
export const InvalidRequest = z.object({
  error: z.literal('invalid_request'),
  field: z.string().max(120),
  reason: z.string().max(300),
  /** Type-gate results only (T-06): the four types that exist, and the one the text probably meant. */
  allowed_task_types: z.array(z.enum(TASK_TYPES)).optional(),
  suggested_task_type: z.enum(TASK_TYPES).optional(),
});
export type InvalidRequest = z.infer<typeof InvalidRequest>;
