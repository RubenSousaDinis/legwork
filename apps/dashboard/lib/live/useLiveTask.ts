'use client';

import { useEffect, useRef, useState } from 'react';
import { getTaskReceipt, type TaskReceipt } from '../data/receipt';
import { createPoller, DEFAULT_INTERVAL_MS } from './poll';

/** Once the money has moved for good there is nothing left to poll for. */
const TERMINAL = new Set(['released', 'refunded', 'resolved']);

export interface UseLiveTaskOptions {
  intervalMs?: number;
}

/**
 * The receipt, re-read every 3 s until the task is terminal.
 *
 * The poll runs in the browser and therefore carries no buyer token — the token is a
 * server-side header and stays one. So a signed `proof.url` the server already
 * resolved is carried forward while the proof hash is unchanged: the gated thumbnail
 * belongs to this buyer and must not blink out of the page on the next tick.
 */
export function useLiveTask(initial: TaskReceipt, opts: UseLiveTaskOptions = {}): TaskReceipt {
  const [receipt, setReceipt] = useState<TaskReceipt>(initial);
  // Read inside the poll without restarting it: the loop's own interval is the clock.
  const latest = useRef(initial);
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const id = initial.task.task_id;
  const startsTerminal = TERMINAL.has(initial.task.status);

  useEffect(() => {
    latest.current = initial;
    setReceipt(initial);
  }, [initial]);

  useEffect(() => {
    if (startsTerminal) return;
    const poller = createPoller<TaskReceipt>({
      fetchOnce: async () => {
        const previous = latest.current;
        const next = await getTaskReceipt(id);
        if (!next) return { value: previous, changed: false };
        const merged = withCarriedProofUrl(previous, next);
        latest.current = merged;
        return {
          value: merged,
          changed: next.task.changed,
          pollAfterSeconds: next.task.poll_after_seconds,
        };
      },
      intervalMs,
      onChange: setReceipt,
    });
    return () => poller.dispose();
  }, [id, intervalMs, startsTerminal]);

  return receipt;
}

function withCarriedProofUrl(previous: TaskReceipt, next: TaskReceipt): TaskReceipt {
  const url = previous.task.proof?.url;
  if (!url || !next.task.proof || next.task.proof.url) return next;
  if (next.task.proof.hash !== previous.task.proof?.hash) return next;
  return { ...next, task: { ...next.task, proof: { ...next.task.proof, url } } };
}
