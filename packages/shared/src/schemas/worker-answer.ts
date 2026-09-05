import { z } from 'zod';
import { NOTE_MAX_CHARS } from '../constants';

/**
 * The only shape in which worker text ever reaches an agent. `_source` and `_untrusted` are
 * literals so nothing downstream can drop them by accident: worker output is data, never
 * instructions.
 */
export const WorkerAnswer = z.object({
  answer: z.string().max(40),
  note: z.string().max(NOTE_MAX_CHARS).optional(),
  _source: z.literal('worker'),
  _untrusted: z.literal(true),
});
export type WorkerAnswer = z.infer<typeof WorkerAnswer>;

export function wrapWorkerAnswer(answer: string, note?: string): WorkerAnswer {
  return { answer, ...(note !== undefined ? { note } : {}), _source: 'worker', _untrusted: true };
}
