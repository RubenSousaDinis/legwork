import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { poolString } from '../lib/format';
import { getLiveDashboardData, refusalCounts } from '../lib/data/live';
import { http, HttpResponse } from 'msw';
import {
  downHandlers,
  feedHandler,
  fixtures,
  liveHandlers,
  liveServer,
  postersHandler,
  preflightHandler,
  refusalsHandler,
  SUBGRAPH_URL,
} from '../lib/data/fixtures/live/handlers';

const server = liveServer();

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUBGRAPH_QUERY_URL = SUBGRAPH_URL;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('live adapter', () => {
  it('liveFeedMergesRefusalsWithoutSpec', async () => {
    server.use(...liveHandlers(fixtures.refusals1));
    const result = await getLiveDashboardData();

    // Four funded rows plus the one refusal, newest first.
    expect(result.feed).toHaveLength(5);
    expect(result.feed.map((r) => r.taskId.replace(/^refused-.*/, 'refused'))).toEqual([
      '7',
      '8',
      'refused',
      '6',
      '5',
    ]);

    const refused = result.feed[2]!;
    expect(refused.state).toBe('refused');
    expect(refused.refusal?.class).toBe('authentication circumvention');
    expect(refused.type).toBe('call-confirm');
    // A refused task moves no money, so the row it becomes carries none.
    expect(refused.priceUsdc).toBe(0);
    expect(refused.agentPaysUsdc).toBe(0);

    // Rule (9): `seeded` comes from the flag on the row, never inferred.
    expect(result.feed.find((r) => r.taskId === '6')?.seeded).toBe(true);
    expect(result.feed.find((r) => r.taskId === '5')?.seeded).toBe(true);
    expect(result.feed.find((r) => r.taskId === '7')?.seeded).toBe(false);

    // Rule (2): only a funded row can be featured, and the money is a sum.
    expect(result.featured?.taskId).toBe('7');
    expect(result.featured?.agentPays).toBe(3.45);
    expect(result.featured?.escrowLocked).toBe(3.45);
    expect(result.featured?.workerReceives).toBe(3.0);
    expect(result.featured?.fee).toBe(0.45);
    expect(result.featured?.state).toBe('released');
    expect(result.featured?.proofPresent).toBe(true);

    // Nothing a public surface may not carry survives the mapping. The fixture holds
    // both strings, so this assertion is proving something.
    const serialised = JSON.stringify(result);
    expect(JSON.stringify(fixtures.refusals1)).toContain('SPEC-LEAK');
    expect(JSON.stringify(fixtures.refusals1)).toContain('0xPAYER');
    expect(serialised).not.toContain('SPEC-LEAK');
    expect(serialised).not.toContain('0xPAYER');

    expect(result.pool.real).toBe(1);
    expect(result.pool.seeded).toBe(20);
    expect(poolString(result.pool.real, result.pool.seeded)).toBe(
      '1 real · +20 seeded (demo data)',
    );
    expect(result.dataMode).toBe('live');
  });

  it('livePinsTheFilmedTaskAndReadsTheAgent', async () => {
    server.use(...liveHandlers(fixtures.refusals1, fixtures.marks1));
    const result = await getLiveDashboardData({ taskId: '8' });

    // `?task=` pins the featured row even though a newer one exists.
    expect(result.featured?.taskId).toBe('8');
    expect(result.featured?.state).toBe('locked');
    expect(result.featured?.agentPays).toBe(3.45);

    // Every field of the agent card is the subgraph's. The id is the featured task's
    // `Task.buyerAgentId`, the marks are the `Mark` rows against it with the class id
    // mapped back through the shared table, and `paid on proof` is its `outcome: 1`
    // rows. The public API carries no requester identity and none is read.
    expect(result.agent.id).toBe('8004-1207');
    expect(result.agent.marks).toBe(1);
    expect(result.agent.lastMarkClass).toBe('authentication circumvention');
    expect(result.agent.paidOnProof).toBe(1);
    expect(result.agent.score).toBeNull();
    expect(JSON.stringify(fixtures.feed)).not.toContain('buyer_agent_id');

    // The highlighted worker is the real one, with a real completion time.
    expect(result.pool.highlighted?.id).toBe('w-0417');
    expect(result.pool.highlighted?.minutesReal).toBe(12);
    // A reset worker is counted nowhere and listed nowhere.
    expect(result.pool.rows).toHaveLength(21);
    expect(result.pool.rows.filter((r) => !r.seeded)).toHaveLength(1);

    expect(result.preflight).toEqual({
      active: 4,
      verified: 1,
      seeded: 3,
      scoreFloor: 4.2,
      medianMinutes: 9,
      medianSource: 'seeded',
      nReal: 0,
    });
    expect(result.posterStats).toEqual({ distinctExternalBuyers: 1, externalTasks: 2 });
    expect(result.sourceNotes).toBeUndefined();
  });

  it('liveScreeningCarriesNoSpecTextAndFallsBackToTheSubgraphHash', async () => {
    server.use(...liveHandlers(fixtures.refusals1));
    const result = await getLiveDashboardData();

    // One REFUSED line plus one PASSED line per funded row, newest first.
    expect(result.screening.map((l) => l.outcome)).toEqual([
      'passed',
      'passed',
      'refused',
      'passed',
      'passed',
    ]);
    const refused = result.screening[2]!;
    expect(refused.class).toBe('authentication circumvention');
    expect(refused.ruleId).toBe('kw-otp-readback');
    expect(refused.marked).toBe(true);
    // `ScreeningLine` has no spec-text field, so there is nothing here to leak.
    expect(Object.keys(refused)).not.toContain('spec');
    for (const line of result.screening) expect(line.specHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('liveNamesTheSourceThatFailedAndNeverSubstitutesDemoNumbers', async () => {
    server.use(...downHandlers());
    const result = await getLiveDashboardData();

    expect(result.featured).toBeNull();
    expect(result.feed).toEqual([]);
    expect(result.pool).toEqual({ real: 0, seeded: 0, rows: [] });
    expect(result.posterStats).toEqual({ distinctExternalBuyers: 0, externalTasks: 0 });
    expect(result.preflight.medianSource).toBe('n/a');
    expect(result.agent.id).toBe('—');
    expect(result.sourceNotes).toContain('feed unavailable');
    expect(result.sourceNotes).toContain('preflight unavailable');
    // Never a demo figure in live mode.
    expect(JSON.stringify(result)).not.toContain('3.45');
    expect(result.dataMode).toBe('live');
  });

  it('liveAgentIsBlankWithoutTheSubgraphRatherThanGuessed', async () => {
    // The refusals feed still carries `agent_id: '8004-1207'` and a marked entry, and
    // it still must not become an agent: attributing a mark to an agent the index
    // cannot confirm is exactly the guess this adapter refuses to make.
    server.use(feedHandler(), refusalsHandler(fixtures.refusals1), postersHandler(), preflightHandler());
    server.use(http.post(SUBGRAPH_URL, () => new HttpResponse(null, { status: 503 })));
    const result = await getLiveDashboardData();

    expect(result.agent.id).toBe('—');
    expect(result.agent.marks).toBe(0);
    expect(result.agent.lastMarkClass).toBeUndefined();
    expect(result.sourceNotes).toContain('worker pool unavailable');
    // The refusal is still a feed row and a screening line; only the agent card is blank.
    expect(result.feed.some((r) => r.state === 'refused')).toBe(true);
    expect(result.screening.some((l) => l.outcome === 'refused' && l.marked)).toBe(true);
  });

  it('liveReadsEitherRefusalCountShape', () => {
    // `api-contract.ts` freezes `classes: [{class, count}]`; §5's expected shape is a
    // `counts` record. Both are read, so the adapter is right either way.
    const fromRecord = refusalCounts({ counts: { 'referral fraud': 3 } });
    const fromArray = refusalCounts({ classes: [{ class: 'referral fraud', count: 3 }] });
    expect(fromRecord['referral fraud']).toBe(3);
    expect(fromArray['referral fraud']).toBe(3);
    expect(fromRecord['credential fraud']).toBe(0);
    expect(Object.keys(fromArray)).toHaveLength(6);
  });

  it('recordedFixturesAreLeiriaAndCarryNothingPublicSurfacesMayNot', () => {
    const all = JSON.stringify(fixtures);
    expect(all).not.toContain('buyer_token');
    for (const row of fixtures.feed.tasks) expect(row.area).toBe('ez1dp');
    // The public feed carries no requester identity, and the adapter does not want one.
    expect(JSON.stringify(fixtures.feed)).not.toContain('buyer_agent_id');

    // The refusal fixture deliberately carries the four fields no surface may render.
    const recent = fixtures.refusals1.recent[0]!;
    expect(recent.spec).toBe('SPEC-LEAK');
    expect(recent.payer).toBe('0xPAYER');
    expect(recent.agent_id).toBe('8004-1207');
    expect(recent.mark_tx).toBe('0xMARK');

    expect(fixtures.pool.workers.filter((w) => !w.seeded && !w.reset)).toHaveLength(1);
    expect(fixtures.pool.workers.filter((w) => w.seeded)).toHaveLength(20);
  });
});
