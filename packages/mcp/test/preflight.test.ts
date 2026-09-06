/**
 * The number the Graph prize is judged on, and the one an agent decides on.
 *
 * `verified` and `seeded` stay two numbers. A median is labelled `'real'` only when real
 * completions produced it — variant B is the case that matters: the one real worker is still
 * active, but nothing they finished was a `verify-open`, so `n_real` is 0 and the median says
 * `'seeded'` rather than borrowing the seeded number and calling it real.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computePreflight } from '../src/preflight/compute';
import { fetchPreflight } from '../src/preflight/index';
import { AREA, NOW_SECONDS, TASK_TYPE, WORLD_WORKERS, fakeStudio } from './fixtures/studio';
import { DASHBOARD_URL, connect } from './harness';

const INACTIVE_WORKER = '0x5555555555555555555555555555555555555555';
const OTHER_AREA_WORKER = '0x6666666666666666666666666666666666666666';

afterEach(() => vi.useRealTimers());

describe('preflightSplitsRealSeeded', () => {
  it('variant A: one real completion carries the median', async () => {
    const counts = await fetchPreflight(
      fakeStudio('A'),
      { task_type: TASK_TYPE, area: AREA },
      NOW_SECONDS,
    );

    expect(counts).toEqual({
      active: 4,
      verified: 1,
      seeded: 3,
      median_minutes: 11,
      median_source: 'real',
      n_real: 1,
      score_floor: 5,
    });
  });

  it('variant B: the real worker finished a different type, so the median says seeded', async () => {
    const counts = await fetchPreflight(
      fakeStudio('B'),
      { task_type: TASK_TYPE, area: AREA },
      NOW_SECONDS,
    );

    expect(counts).toEqual({
      active: 4,
      verified: 1,
      seeded: 3,
      median_minutes: 9,
      median_source: 'seeded',
      n_real: 0,
      score_floor: 5,
    });
  });

  it('never counts the inactive worker or the neighbouring area', async () => {
    const studio = fakeStudio('A');
    await fetchPreflight(studio, { task_type: TASK_TYPE, area: AREA }, NOW_SECONDS);

    // Both are in the recorded world; neither survives the documents' own where-clause.
    expect(WORLD_WORKERS.map((w) => w.id)).toContain(INACTIVE_WORKER);
    expect(WORLD_WORKERS.map((w) => w.id)).toContain(OTHER_AREA_WORKER);

    const served = await studio.query<{ workers: { id: string }[] }>(
      studio.calls[0]!.document,
      studio.calls[0]!.variables,
    );
    const ids = served.workers.map((w) => w.id);
    expect(ids).not.toContain(INACTIVE_WORKER);
    expect(ids).not.toContain(OTHER_AREA_WORKER);
    expect(ids).toHaveLength(4);
  });

  it('drops a stale row the index still returns', () => {
    // A worker whose last completion is three weeks old, served anyway: the window is checked
    // again here, so a stale or hand-built response cannot inflate `active`.
    const stale = WORLD_WORKERS.filter((w) => w.id === INACTIVE_WORKER);
    const counts = computePreflight(
      { task_type: TASK_TYPE, workers: stale, tasks: [] },
      NOW_SECONDS,
    );
    expect(counts.active).toBe(0);
    expect(counts.median_source).toBe('n/a');
    expect(counts.median_minutes).toBeNull();
  });

  it('keeps a worker only when their bitmask includes the type', async () => {
    const compareTwo = await fetchPreflight(
      fakeStudio('A'),
      { task_type: 'compare-two', area: AREA },
      NOW_SECONDS,
    );
    // The real worker's mask is 3 (verify-open | photo-of), so they are not a candidate here,
    // and neither is the one seeded worker who only takes verify-open.
    expect(compareTwo.verified).toBe(0);
    expect(compareTwo.seeded).toBe(2);
    expect(compareTwo.median_source).toBe('n/a');
  });

  it('reports the subgraph counts through the tool, with a dashboard url', async () => {
    // The fixture's seven-day window is anchored to the recording, so pin the clock to it.
    vi.useFakeTimers();
    vi.setSystemTime(NOW_SECONDS * 1000);

    const harness = await connect({ mode: 'local', subgraph: fakeStudio('A') });
    try {
      const result = (await harness.client.callTool({
        name: 'preflight_workers',
        arguments: { task_type: TASK_TYPE, area: AREA },
      })) as { structuredContent: Record<string, unknown> };

      expect(result.structuredContent.verified).toBe(1);
      expect(result.structuredContent.seeded).toBe(3);
      expect(result.structuredContent.dashboard_url).toBe(DASHBOARD_URL);
    } finally {
      await harness.close();
    }
  });
});
