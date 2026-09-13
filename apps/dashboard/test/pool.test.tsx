import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { PoolChip, PoolHeadline } from '../components/PoolChip';
import { SUBGRAPH_URL } from '../lib/data/fixtures/live/handlers';
import { countPool, demoPoolHeadline, poolHeadline, resetPoolHeadlineForTests } from '../lib/data/pool';

const server = setupServer();

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUBGRAPH_QUERY_URL = SUBGRAPH_URL;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  resetPoolHeadlineForTests();
  cleanup();
});
afterAll(() => server.close());

const flags = (real: number, seeded: number, reset: number) => [
  ...Array.from({ length: real }, () => ({ seeded: false, reset: false })),
  ...Array.from({ length: seeded }, () => ({ seeded: true, reset: false })),
  ...Array.from({ length: reset }, () => ({ seeded: false, reset: true })),
];

describe('pool headline', () => {
  it('demoModeReadsDemoDataByteForByte', async () => {
    expect(demoPoolHeadline()).toBe('1 real · +20 seeded (demo data)');
    expect(await poolHeadline('demo')).toBe('1 real · +20 seeded (demo data)');
    expect(await poolHeadline(undefined)).toBe('1 real · +20 seeded (demo data)');
  });

  it('liveModeCountsTheSubgraphTheWayTheLiveBoardDoes', async () => {
    // One real, twenty-three seeded and one reset registration: the reset one is nowhere.
    server.use(
      http.post(SUBGRAPH_URL, () => HttpResponse.json({ data: { workers: flags(1, 23, 1) } })),
    );
    expect(countPool(flags(1, 23, 1))).toEqual({ real: 1, seeded: 23 });
    expect(await poolHeadline('live')).toBe('1 real · +23 seeded (demo data)');
  });

  it('liveModePrintsNothingRatherThanADemoNumberWhenTheIndexIsDown', async () => {
    server.use(http.post(SUBGRAPH_URL, () => new HttpResponse(null, { status: 503 })));
    expect(await poolHeadline('live')).toBeNull();
  });

  it('demoModeChipRendersSynchronously', () => {
    const chip = render(<PoolChip />).container;
    expect(chip.querySelector('.chip-seeded')?.textContent).toBe('1 real · +20 seeded (demo data)');
    expect(chip.querySelector('.chip-seeded')?.getAttribute('data-floor')).toBe('32');
    cleanup();
    const line = render(
      <p>
        The pool reads <PoolHeadline />. Never a total.
      </p>,
    ).container;
    expect(line.textContent).toBe('The pool reads 1 real · +20 seeded (demo data). Never a total.');
  });
});
