/**
 * The service and the MCP tool must answer with the same numbers, so this runs the same
 * recorded fixture the package's own test does — a second fixture would be a second definition
 * of "active", and the two would drift.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AREA,
  NOW_SECONDS,
  TASK_TYPE,
  fakeStudio,
} from '../../../../packages/mcp/test/fixtures/studio';
import { resetConfigForTests } from '../config';

const DASHBOARD_URL = 'https://dashboard.legwork.test';
const SUBGRAPH_URL = 'https://subgraph.legwork.test/query';

// The one live thing this service touches is The Graph, and the fixture stands in for it. No
// Studio URL is ever dialled.
const studio = fakeStudio('A');
vi.mock('@legwork/subgraph-client', () => ({ createSubgraphClient: () => studio }));

beforeEach(() => {
  resetConfigForTests({ DASHBOARD_URL, SUBGRAPH_QUERY_URL: SUBGRAPH_URL });
});

describe('getPreflight', () => {
  it('splits real from seeded and carries the dashboard url', async () => {
    const { getPreflight } = await import('./preflight');

    const result = await getPreflight({ task_type: TASK_TYPE, area: AREA }, () => NOW_SECONDS * 1000);

    expect(result).toEqual({
      active: 4,
      verified: 1,
      seeded: 3,
      median_minutes: 11,
      median_source: 'real',
      n_real: 1,
      score_floor: 5,
      dashboard_url: DASHBOARD_URL,
    });
  });

  it('is the name the public route reaches for', async () => {
    const { getPreflight, preflightWorkers } = await import('./preflight');
    expect(preflightWorkers).toBe(getPreflight);
  });

  it('answers zeros, not a guess, when there is no subgraph to ask', async () => {
    resetConfigForTests({ DASHBOARD_URL, SUBGRAPH_QUERY_URL: undefined });
    const { getPreflight } = await import('./preflight');

    const result = await getPreflight({ task_type: TASK_TYPE, area: AREA });

    expect(result).toEqual({
      active: 0,
      verified: 0,
      seeded: 0,
      median_minutes: null,
      median_source: 'n/a',
      n_real: 0,
      score_floor: 0,
      dashboard_url: DASHBOARD_URL,
    });
  });
});
