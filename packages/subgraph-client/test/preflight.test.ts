import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reducePreflight } from '../src/preflight.js';
import type { PreflightSource, TaskRow } from '../src/types.js';

function loadPreflight(): PreflightSource {
  const path = fileURLToPath(new URL('../fixtures/preflight.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as PreflightSource;
}

describe('preflightFixtureSplits', () => {
  it('preflightFixtureSplits', () => {
    const source = loadPreflight();
    const counts = reducePreflight(source);

    // "4 active · 1 verified · 3 seeded" — three numbers, never one total, so nobody
    // reads the pool as four real humans.
    expect(counts.active).toBe(4);
    expect(counts.verified).toBe(1);
    expect(counts.seeded).toBe(3);

    // No real completion yet, so the median comes from the seeded rows and says so.
    expect(counts.n_real).toBe(0);
    expect(counts.median_minutes).toBe(9);
    expect(counts.median_source).toBe('seeded');

    // One real completion of 5 minutes outranks all three seeded ones: the median is
    // taken from real completions the moment there is one.
    const real = source.workers.find((w) => !w.seeded);
    expect(real).toBeDefined();
    const template = source.tasks[0] as TaskRow;
    const claimedAt = Number(template.claimedAt);
    const realTask: TaskRow = {
      ...template,
      id: '104',
      worker: { id: (real as { id: string }).id, seeded: false },
      seeded: false,
      claimedAt: String(claimedAt),
      releasedAt: String(claimedAt + 5 * 60),
    };

    const withReal = reducePreflight({ workers: source.workers, tasks: [...source.tasks, realTask] });
    expect(withReal.median_minutes).toBe(5);
    expect(withReal.median_source).toBe('real');
    expect(withReal.n_real).toBe(1);

    // The split does not move: one extra task is not one extra worker.
    expect(withReal.active).toBe(4);
    expect(withReal.verified).toBe(1);
    expect(withReal.seeded).toBe(3);
  });

  it('says n/a rather than inventing a number when nothing has completed', () => {
    const source = loadPreflight();
    const counts = reducePreflight({ workers: source.workers, tasks: [] });
    expect(counts.median_minutes).toBeNull();
    expect(counts.median_source).toBe('n/a');
    expect(counts.n_real).toBe(0);
  });
});
