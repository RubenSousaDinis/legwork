'use client';

import { useLiveTask } from '../../../lib/live/useLiveTask';
import type { TaskReceipt } from '../../../lib/data/receipt';
import { Receipt } from './Receipt';

/**
 * Live mode only: the same presentational receipt, re-read every 3 s until the task is
 * terminal. The buyer token stays on the server — this poll is the public read.
 */
export function LiveReceipt({ initial }: { initial: TaskReceipt }) {
  const receipt = useLiveTask(initial);
  return <Receipt task={receipt.task} seeded={receipt.seeded} dataMode="live" />;
}
