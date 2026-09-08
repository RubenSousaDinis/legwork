/**
 * The two rules the demo agent's loop obeys, kept apart from the loop itself.
 *
 * `agent.ts` needs the Claude Agent SDK, a buyer key and a live API to run at all. These two
 * decisions need none of that, and they are the two a reviewer most wants to read, so they
 * live here and `prompt.test.ts` exercises them with no SDK import and no network.
 */
import { wrapWorkerAnswer, type WorkerAnswer } from '@legwork/shared';

/**
 * Every Legwork tool answers with one JSON object. The loop reads two fields off it and
 * nothing else, so this is the whole type it needs.
 */
export interface ToolResultLike {
  refused?: unknown;
  [key: string]: unknown;
}

/**
 * Stop after a refusal, always.
 *
 * `refused: true` is the API's final word: `retryable` is `false`, the task moved no money,
 * and the payload carries the sentence saying not to rephrase and try again. A loop that
 * retries here is the exact behaviour the screening gate exists to catch — the second
 * attempt marks the agent onchain — so this is the single place in `examples/` that decides
 * to end a scene, and it decides on the flag rather than on the message text.
 *
 * Anything else — a task id, a status, an error the agent can act on — is not a stop.
 */
export function shouldStop(toolResult: ToolResultLike | null | undefined): boolean {
  return toolResult?.refused === true;
}

/**
 * Worker text, in the only shape it is allowed to travel in.
 *
 * A worker types free text into a phone. The moment that string is concatenated into a
 * prompt it stops being data and starts being instructions, which is how a note saying
 * "ignore your previous instructions" becomes a tool call. `task_status` already wraps its
 * `answer`; this re-stamps the wrapper on the way into the transcript so a stray `_source`
 * or `_untrusted` cannot be dropped between the tool result and the record of the run.
 *
 * A plain string is accepted for the same reason: it is what a caller reaches for, and it
 * comes back wrapped rather than trusted.
 */
export function wrapWorkerText(answer: unknown): WorkerAnswer {
  if (typeof answer === 'string') return wrapWorkerAnswer(answer);

  const record = (answer ?? {}) as Record<string, unknown>;
  const text = typeof record.answer === 'string' ? record.answer : '';
  const note = typeof record.note === 'string' ? record.note : undefined;
  return wrapWorkerAnswer(text, note);
}
