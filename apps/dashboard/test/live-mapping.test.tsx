import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { poolString } from '../lib/format';
import { getLiveDashboardData, isFunded, refusalCounts, toFeedRow, type WireFeedRow } from '../lib/data/live';
import { metaWithDisclosure } from '../components/TaskRow';
import { ScreeningLog } from '../components/ScreeningLog';
import { TaskRow } from '../components/TaskRow';
import { http, HttpResponse } from 'msw';
import {
  downHandlers,
  FEED_DATE,
  feedHandler,
  fixtures,
  liveHandlers,
  liveServer,
  ORIGIN,
  postersHandler,
  preflightHandler,
  refusalsHandler,
  subgraphHandler,
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
  it('feedRowShowsLocalityWhenTheWireCarriesIt', () => {
    const row = toFeedRow({
      task_id: 'b1',
      task_type: 'photo-of',
      fee_usdc: 0.45,
      amount_usdc: 3,
      area: 'u33db',
      locality: 'Berlin',
      country: 'DE',
      posted_at: '2026-09-05T14:02:00.000Z',
      seeded: true,
    });
    expect(row.locality).toBe('Berlin · DE');
    expect(row.meta.endsWith('· Berlin · DE')).toBe(true);
    expect(row.meta).not.toContain('u33db');
  });

  it('feedRowFallsBackToTheAreaWithoutLocality', () => {
    const row = toFeedRow({
      task_id: 'l1',
      task_type: 'verify-open',
      fee_usdc: 0.45,
      amount_usdc: 3,
      area: 'ez1dp',
      posted_at: '2026-09-05T14:02:00.000Z',
    });
    expect(row.locality).toBeUndefined();
    expect(row.meta.endsWith('· ez1dp')).toBe(true);
  });

  it('feedRowLocalityAloneWhenCountryIsMissing', () => {
    const row = toFeedRow({
      task_id: 'p1',
      task_type: 'verify-open',
      fee_usdc: 0.45,
      amount_usdc: 3,
      area: 'ez1dp',
      locality: 'Porto',
      posted_at: '2026-09-05T14:02:00.000Z',
    });
    expect(row.locality).toBe('Porto');
  });

  it('callConfirmDisclosureStillFollowsTheLocality', () => {
    const row = toFeedRow({
      task_id: 'c1',
      task_type: 'call-confirm',
      fee_usdc: 0.45,
      amount_usdc: 2,
      area: 'u33db',
      locality: 'Berlin',
      country: 'DE',
      posted_at: '2026-09-05T14:02:00.000Z',
    });
    const meta = metaWithDisclosure(row);
    expect(meta).toContain('· Berlin · DE ·');
    expect(meta.endsWith('self-reported answer + timestamp (unverified)')).toBe(true);
  });

  it('liveFeedMergesRefusalsWithoutSpec', async () => {
    server.use(...liveHandlers(fixtures.refusals1));
    const result = await getLiveDashboardData();

    // Five funded rows plus two refusals (the five-key wire row and the leaky extra), newest first.
    expect(result.feed).toHaveLength(7);
    expect(result.feed.map((r) => r.taskId.replace(/^refused-.*/, 'refused'))).toEqual([
      '7',
      '8',
      'refused',
      '6',
      '5',
      '9',
      'refused',
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

    // Two REFUSED lines plus one PASSED line per funded row, newest first. Row 9 has no
    // post tx — it never funded an escrow and never went through the gate — so no line.
    expect(result.screening.map((l) => l.outcome)).toEqual([
      'passed',
      'passed',
      'refused',
      'passed',
      'passed',
      'refused',
    ]);
    const refused = result.screening[2]!;
    expect(refused.class).toBe('authentication circumvention');
    expect(refused.ruleId).toBe('kw-otp-readback');
    expect(refused.marked).toBe(true);
    expect(refused.reason).toBeUndefined();
    // `ScreeningLine` has no spec-text field, so there is nothing here to leak.
    expect(Object.keys(refused)).not.toContain('spec');
    // Funded rows still carry a hash from the feed or the subgraph. A live refusal
    // has none: the wire does not send spec_hash, and the adapter must not invent one.
    for (const line of result.screening) {
      if (line.outcome === 'passed') expect(line.specHash).toMatch(/^0x[0-9a-f]{64}$/);
      else expect(line.specHash).toBe('');
    }
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

  it('recordedFixturesCarryNothingPublicSurfacesMayNot', () => {
    const all = JSON.stringify(fixtures);
    expect(all).not.toContain('buyer_token');
    for (const row of fixtures.feed.tasks) {
      expect(row.area).toBeTruthy();
      if (row.locality !== 'Berlin') expect(row.area).toBe('ez1dp');
    }
    const berlin = fixtures.feed.tasks.find((row) => row.locality === 'Berlin');
    expect(berlin?.seeded).toBe(true);
    expect(berlin?.area).toBe('u33db');
    // The public feed carries no requester identity, and the adapter does not want one.
    expect(JSON.stringify(fixtures.feed)).not.toContain('buyer_agent_id');

    // The first recent entry is the five keys the API actually returns.
    const fiveKey = fixtures.refusals1.recent[0]!;
    expect(Object.keys(fiveKey).sort()).toEqual(['at', 'class', 'marked', 'rule_id', 'task_type']);
    // A later entry still carries the four fields no surface may render, so this
    // assertion has a subject proving they are dropped.
    const leaky = fixtures.refusals1.recent.find((entry) => 'spec' in entry && 'payer' in entry)!;
    expect(leaky.spec).toBe('SPEC-LEAK');
    expect(leaky.payer).toBe('0xPAYER');
    expect(leaky.agent_id).toBe('8004-1207');
    expect(leaky.mark_tx).toBe('0xMARK');

    expect(fixtures.pool.workers.filter((w) => !w.seeded && !w.reset)).toHaveLength(1);
    expect(fixtures.pool.workers.filter((w) => w.seeded)).toHaveLength(20);
  });

  it('liveRefusalRendersItsClassOnce', async () => {
    server.use(
      ...liveHandlers({
        recent: [
          {
            at: '2026-09-05T10:30:00.000Z',
            task_type: 'call-confirm',
            class: 'authentication circumvention',
            marked: false,
          },
        ],
      }),
    );
    const result = await getLiveDashboardData();
    const refused = result.feed.find((r) => r.state === 'refused')!;
    expect(refused.refusal?.reason).toBeUndefined();

    const { container } = render(<TaskRow row={refused} />);
    const floor = container.querySelector('[data-floor="32"]')!;
    expect(floor.className).toBe('task-row-refusal');
    const classHits = (floor.textContent ?? '').split('authentication circumvention').length - 1;
    expect(classHits).toBe(1);
    expect(floor.textContent).not.toContain('·');
  });

  it('liveRefusalOmitsTheSpecLabelWhenTheWireSendsNoHash', async () => {
    // `/public/refusals.recent` withholds `spec_hash` for the same reason it withholds
    // `reason`, so a live refused line has no hash to print. The label went out on its
    // own — a bare `spec` — until it was made conditional.
    server.use(
      ...liveHandlers({
        recent: [
          {
            at: '2026-09-05T10:30:00.000Z',
            task_type: 'call-confirm',
            class: 'authentication circumvention',
            rule_id: 'deny.auth',
            marked: false,
          },
        ],
      }),
    );
    const result = await getLiveDashboardData();
    const refused = result.screening.find((l) => l.outcome === 'refused')!;
    expect(refused.specHash).toBe('');

    const { container } = render(<ScreeningLog lines={[refused]} />);
    expect(container.querySelector('.screening-spec')).toBeNull();
    expect(container.textContent).not.toContain('spec ');
    // The half that does exist still renders.
    expect(container.textContent).toContain('authentication circumvention · deny.auth');
  });

  it('liveRefusalUsesTheRuleIdAsTheSecondPart', async () => {
    server.use(
      ...liveHandlers({
        recent: [
          {
            at: '2026-09-05T10:30:00.000Z',
            task_type: 'call-confirm',
            class: 'authentication circumvention',
            rule_id: 'deny.auth',
            marked: false,
          },
        ],
      }),
    );
    const result = await getLiveDashboardData();
    const refused = result.feed.find((r) => r.state === 'refused')!;
    expect(refused.refusal?.ruleId).toBe('deny.auth');

    const { container } = render(<TaskRow row={refused} />);
    const floor = container.querySelector('[data-floor="32"]')!;
    expect(floor.textContent).toBe('authentication circumvention · deny.auth');
  });

  it('refusedRowSaysNoMoneyMovedOnce', async () => {
    server.use(...liveHandlers(fixtures.refusals1));
    const result = await getLiveDashboardData();
    const refused = result.feed.find((r) => r.state === 'refused')!;
    expect(refused.meta).toMatch(/^posted \d{2}:\d{2}$/);
    expect(refused.meta).not.toContain('no money moved');

    const { container } = render(<TaskRow row={refused} />);
    const text = container.textContent ?? '';
    expect(text.split('no money moved')).toHaveLength(2);
    expect(refused.type).toBe('call-confirm');
    expect(text).toContain('self-reported answer + timestamp (unverified)');
  });

  it('screeningLogRefusedLineHasNoDuplicateClass', async () => {
    server.use(
      ...liveHandlers({
        recent: [
          {
            at: '2026-09-05T10:30:00.000Z',
            task_type: 'call-confirm',
            class: 'authentication circumvention',
            rule_id: 'deny.auth',
            marked: false,
          },
          {
            at: '2026-09-05T10:00:00.000Z',
            task_type: 'call-confirm',
            class: 'authentication circumvention',
            marked: false,
          },
        ],
      }),
    );
    const result = await getLiveDashboardData();
    const withRule = result.screening.find((l) => l.outcome === 'refused' && l.ruleId === 'deny.auth')!;
    const without = result.screening.find((l) => l.outcome === 'refused' && !l.ruleId)!;
    expect(withRule.reason).toBeUndefined();
    expect(without.reason).toBeUndefined();

    const { container } = render(<ScreeningLog lines={[withRule, without]} />);
    const reasons = [...container.querySelectorAll('.screening-reason')];
    expect(reasons[0]?.textContent).toBe('authentication circumvention · deny.auth');
    expect(reasons[1]?.textContent).toBe('authentication circumvention');
    for (const el of reasons) {
      expect((el.textContent ?? '').split('authentication circumvention')).toHaveLength(2);
    }
  });
});

/**
 * A seeded board row (`/admin/seed-demo`) carries `demo-data.json`'s placeholder in `tx.post`
 * and never touched the chain. It is a feed row with a `seeded` chip and nothing else: never
 * the featured task, never a cent in the totals, never a PASSED line in the screening log.
 */
describe('funded rows only', () => {
  const FUNDED_POST = `0x${'1a'.repeat(32)}`;
  const PLACEHOLDER = '0x8f2a…c41d';
  const AT = (minutesAgo: number) =>
    new Date(Date.parse('2026-09-05T11:00:00.000Z') - minutesAgo * 60_000).toISOString();

  function boardRow(id: string, state: string, minutesAgo: number): WireFeedRow {
    return {
      task_id: id,
      state,
      task_type: 'compare-two',
      price_usdc: 1,
      fee_usdc: 0.15,
      area: 'any',
      seeded: true,
      posted_at: AT(minutesAgo),
      tx: { post: PLACEHOLDER },
    };
  }

  function fundedRow(id: string, state: string, minutesAgo: number, released = false): WireFeedRow {
    return {
      task_id: id,
      state,
      task_type: 'verify-open',
      price_usdc: 3,
      fee_usdc: 0.45,
      area: 'ez1dn',
      locality: 'Leiria',
      country: 'PT',
      seeded: true,
      posted_at: AT(minutesAgo),
      ...(released ? { proof: { hash: `0x${'ab'.repeat(32)}`, captured_at: AT(minutesAgo - 1) } } : {}),
      tx: { post: FUNDED_POST, ...(released ? { release: `0x${'cd'.repeat(32)}` } : {}) },
    };
  }

  function withFeed(rows: WireFeedRow[]) {
    server.use(
      http.get(`${ORIGIN}/api/public/feed`, () =>
        HttpResponse.json({ tasks: rows }, { headers: { date: FEED_DATE } }),
      ),
      refusalsHandler(fixtures.refusals0),
      postersHandler(),
      preflightHandler(),
      subgraphHandler(),
    );
  }

  it('isFundedReadsTheEscrowHashAndNothingElse', () => {
    expect(isFunded(fundedRow('41', 'released', 5, true))).toBe(true);
    expect(isFunded(boardRow('9000126', 'open', 1))).toBe(false);
    expect(isFunded({ ...boardRow('9', 'open', 1), tx: {} })).toBe(false);
    // `seeded` is not the signal: the CLI worker's tasks are seeded and funded.
    expect(isFunded({ ...fundedRow('34', 'released', 5, true), seeded: true })).toBe(true);
  });

  it('liveNeverCountsASeededBoardRowAsMoney', async () => {
    withFeed([
      boardRow('9000126', 'open', 1),
      boardRow('9000001', 'released', 2),
      fundedRow('41', 'released', 10, true),
    ]);
    const result = await getLiveDashboardData();

    // The newest rows are board rows; the meter still shows the one real escrow.
    expect(result.featured?.taskId).toBe('41');
    expect(result.featured?.state).toBe('released');
    expect(result.featured?.proofPresent).toBe(true);
    expect(result.totals).toEqual({ lockedUsdc: 0, releasedTodayUsdc: 3, refundedUsdc: 0 });

    // The board rows are still on the feed, newest first, every one chipped.
    expect(result.feed.map((r) => r.taskId)).toEqual(['9000126', '9000001', '41']);
    expect(result.feed.every((r) => r.seeded)).toBe(true);

    // One post went through the gate, so one PASSED line.
    expect(result.screening.filter((l) => l.outcome === 'passed')).toHaveLength(1);
    expect(result.screening[0]?.at).toBe(AT(10));
  });

  it('liveFeaturesTheNewestFundedRowWhenEveryOneWasRefunded', async () => {
    withFeed([boardRow('9000126', 'open', 1), fundedRow('40', 'refunded', 30), fundedRow('39', 'refunded', 40)]);
    const result = await getLiveDashboardData();

    expect(result.featured?.taskId).toBe('40');
    expect(result.featured?.state).toBe('refunded');
    expect(result.totals).toEqual({ lockedUsdc: 0, releasedTodayUsdc: 0, refundedUsdc: 6.9 });
  });

  it('liveMeterIsEmptyWhenOnlyBoardRowsExist', async () => {
    withFeed([boardRow('9000126', 'open', 1), boardRow('9000001', 'released', 2)]);
    const result = await getLiveDashboardData();

    expect(result.featured).toBeNull();
    expect(result.totals).toEqual({ lockedUsdc: 0, releasedTodayUsdc: 0, refundedUsdc: 0 });
    expect(result.feed).toHaveLength(2);
    expect(result.screening.filter((l) => l.outcome === 'passed')).toHaveLength(0);
  });

  it('livePinCannotPutABoardRowOnTheMeter', async () => {
    withFeed([boardRow('9000126', 'open', 1), fundedRow('41', 'claimed', 10)]);
    const result = await getLiveDashboardData({ taskId: '9000126' });

    expect(result.featured?.taskId).toBe('41');
    expect(result.featured?.state).toBe('locked');
    expect(result.totals.lockedUsdc).toBe(3.45);
  });
});
