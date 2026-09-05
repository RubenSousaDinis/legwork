import { describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { PresentCanvas } from '../app/(present)/PresentCanvas';
import { MissionControl } from '../app/MissionControl';
import { TaskRow } from '../components/TaskRow';
import { EscrowMeter } from '../components/EscrowMeter';
import { WorkerPool } from '../components/WorkerPool';
import { PreflightTrio } from '../components/PreflightTrio';
import { poolString } from '../lib/format';
import { demoDashboardData } from '../lib/data/demo';
import type { DashboardData, ScreeningLine, TaskRowData } from '../lib/data/types';

afterEach(cleanup);

/** Frozen so the clock, the elapsed timer and `postedAt` are identical between renders. */
const NOW = Date.parse('2026-09-05T11:20:00.000Z');

function demo(state?: 'locked' | 'submitted' | 'released' | 'refunded'): DashboardData {
  return demoDashboardData({ nowMs: NOW, ...(state ? { state } : {}) });
}

describe('dashboard shell', () => {
  it('refusalNeverMovesMeter', () => {
    const before = demo('locked');

    const refusedRow: TaskRowData = {
      taskId: 'demo-refused-new',
      type: 'call-confirm',
      title: 'Confirm by phone — Leiria',
      priceUsdc: 0,
      agentPaysUsdc: 0,
      state: 'refused',
      meta: 'via hire_human · no money moved · self-reported answer + timestamp (unverified)',
      seeded: false,
      refusal: {
        class: 'authentication circumvention',
        reason: 'asks the worker to read a one-time code aloud from another person handset',
      },
    };
    const refusedLine: ScreeningLine = {
      at: new Date(NOW - 5000).toISOString(),
      outcome: 'refused',
      taskType: 'call-confirm',
      class: 'authentication circumvention',
      reason: 'asks the worker to read a one-time code aloud from another person handset',
      specHash: '0x8f2a00000000000000000000000000000000000000000000000000000000c41d',
      marked: true,
      markTx: '0x8f2a…c41d',
      agentId: before.agent.id,
    };

    const after: DashboardData = {
      ...before,
      feed: [refusedRow, ...before.feed],
      screening: [refusedLine, ...before.screening],
    };

    const first = render(<PresentCanvas data={before} nowMs={NOW} />);
    const meterBefore = first.getByTestId('escrow-meter').outerHTML;
    cleanup();

    const second = render(<PresentCanvas data={after} nowMs={NOW} />);
    const meterAfter = second.getByTestId('escrow-meter').outerHTML;

    // Identical markup: same data-state, same data-progress, same amounts.
    expect(meterAfter).toBe(meterBefore);
    expect(meterAfter).toContain('data-state="locked"');
    expect(meterAfter).toContain('data-progress="0.5"');
  });

  it('emptyMeterRendersZero', () => {
    // What the live dashboard shows from the day T-26 lands until it has a task:
    // no featured funded task means no money on the meter.
    const { container } = render(
      <EscrowMeter featured={null} totals={{ lockedUsdc: 0, releasedTodayUsdc: 0, refundedUsdc: 0 }} />,
    );
    const meter = container.querySelector('[data-testid="escrow-meter"]')!;
    expect(meter.getAttribute('data-progress')).toBe('0');
    expect(meter.getAttribute('data-state')).toBe('locked');
    expect(meter.textContent).toContain('LOCKED');
    expect(meter.textContent).toContain('0.00');
  });

  it('callConfirmDisclosureFromComponent', () => {
    // The component guarantees the line, so a live adapter cannot lose it.
    const base = {
      taskId: 'row-1',
      title: 'Confirm by phone — Leiria',
      priceUsdc: 3,
      agentPaysUsdc: 3.45,
      state: 'submitted',
      meta: 'via hire_human',
      seeded: false,
    } as const;
    const disclosure = 'self-reported answer + timestamp (unverified)';

    const call = render(<TaskRow row={{ ...base, type: 'call-confirm' }} />);
    const callText = call.container.textContent ?? '';
    expect(callText).toContain(disclosure);
    expect(callText.split(disclosure)).toHaveLength(2); // exactly once
    cleanup();

    // A meta that already ends with it is not doubled.
    const already = render(
      <TaskRow row={{ ...base, type: 'call-confirm', meta: `via hire_human · ${disclosure}` }} />,
    );
    expect((already.container.textContent ?? '').split(disclosure)).toHaveLength(2);
    cleanup();

    // Any other type renders none.
    const other = render(<TaskRow row={{ ...base, type: 'verify-open' }} />);
    expect(other.container.textContent ?? '').not.toContain(disclosure);
    cleanup();

    // The demo adapter no longer supplies it; the component still shows it once.
    const demoCall = demo().feed.find((r) => r.type === 'call-confirm')!;
    expect(demoCall.meta).not.toContain(disclosure);
    const fromDemo = render(<TaskRow row={demoCall} />);
    expect((fromDemo.container.textContent ?? '').split(disclosure)).toHaveLength(2);
  });

  it('seededRowsAlwaysChipped', () => {
    const data = demo();

    for (const row of data.feed) {
      const { container, unmount } = render(<TaskRow row={row} />);
      const chips = [...container.querySelectorAll('.chip')].map((c) => c.textContent);
      if (row.seeded) expect(chips).toContain('seeded');
      else expect(chips).not.toContain('seeded');
      unmount();
    }

    const pool = render(<WorkerPool pool={data.pool} />);
    for (const li of pool.container.querySelectorAll('.pool-row')) {
      const chips = [...li.querySelectorAll('.chip')].map((c) => c.textContent);
      if (li.getAttribute('data-seeded') === 'true') expect(chips).toContain('seeded');
      else expect(chips).not.toContain('seeded');
    }

    // The demo fixture must actually exercise both branches.
    expect(data.feed.some((r) => r.seeded)).toBe(true);
    expect(data.feed.some((r) => !r.seeded)).toBe(true);
    expect(data.pool.rows.some((r) => r.seeded)).toBe(true);
    expect(data.pool.rows.some((r) => !r.seeded)).toBe(true);
  });

  it('poolStringExact', () => {
    expect(poolString(1, 20)).toBe('1 real · +20 seeded (demo data)');

    const data = demo();
    const pool = render(<WorkerPool pool={data.pool} />);
    expect(pool.container.textContent).toContain('1 real · +20 seeded (demo data)');
    expect(pool.container.textContent).not.toContain('21');
    cleanup();

    // The Supply card carries the same headline and the same prohibition.
    const supply = render(<PreflightTrio preflight={data.preflight} pool={data.pool} present />);
    expect(supply.container.textContent).toContain('1 real · +20 seeded (demo data)');
    expect(supply.container.textContent).not.toContain('21');
  });

  it('demoModeShowsChip', () => {
    const data = demo();
    const chipTexts = (root: HTMLElement) =>
      [...root.querySelectorAll('.chip')].map((c) => c.textContent);

    const present = render(<PresentCanvas data={data} nowMs={NOW} />);
    expect(chipTexts(present.container)).toContain('DEMO DATA');
    cleanup();

    const normal = render(<MissionControl data={data} />);
    expect(chipTexts(normal.container)).toContain('DEMO DATA');
    cleanup();

    const live: DashboardData = { ...data, dataMode: 'live' };
    const livePresent = render(<PresentCanvas data={live} nowMs={NOW} />);
    expect(chipTexts(livePresent.container)).not.toContain('DEMO DATA');
    cleanup();

    const liveNormal = render(<MissionControl data={live} />);
    expect(chipTexts(liveNormal.container)).not.toContain('DEMO DATA');
  });

  it('presentFloorsDeclared', () => {
    const data = demo();
    const { container } = render(<PresentCanvas data={data} nowMs={NOW} />);
    const stage = container.querySelector('.stage');
    expect(stage).not.toBeNull();
    const floorOf = (el: Element) => el.getAttribute('data-floor');

    // Every chip, the refusal line, the three preflight numerals and their labels,
    // the escrow state word and its amounts: 32.
    const at32 = [
      ...stage!.querySelectorAll('.chip'),
      ...stage!.querySelectorAll('.task-row-refusal'),
      ...stage!.querySelectorAll('.screening-reason'),
      ...stage!.querySelectorAll('.preflight-number'),
      ...stage!.querySelectorAll('.preflight-label'),
      ...stage!.querySelectorAll('.meter-state'),
      ...stage!.querySelectorAll('.meter-amount'),
    ];
    expect(at32.length).toBeGreaterThan(0);
    for (const el of at32) expect(floorOf(el)).toBe('32');
    expect(stage!.querySelectorAll('.preflight-number')).toHaveLength(3);

    // Task rows, the agent id, the marks and both timers: 24.
    const at24 = [
      ...stage!.querySelectorAll('.task-row-title'),
      ...stage!.querySelectorAll('.task-row-price'),
      ...stage!.querySelectorAll('.task-row-meta'),
      ...stage!.querySelectorAll('.agent-id'),
      ...stage!.querySelectorAll('.mark-numeral'),
      ...stage!.querySelectorAll('.mark-label'),
      ...stage!.querySelectorAll('.present-clock'),
      ...stage!.querySelectorAll('.present-elapsed'),
    ];
    expect(at24.length).toBeGreaterThan(0);
    for (const el of at24) expect(floorOf(el)).toBe('24');

    // Status badges are part of the narrated task row, so each declares its own floor.
    const badges = [...stage!.querySelectorAll('.task-row .badge')];
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) expect(floorOf(badge)).toBe('24');

    // Nothing inside the stage carries an inline px length: present mode sizes
    // everything with calc(<design px> * var(--u)) in present.css.
    for (const el of stage!.querySelectorAll('[style]')) {
      expect(el.getAttribute('style')).not.toMatch(/\d\s*px/);
    }
    expect(stage!.getAttribute('style')).toBeNull();
  });

  it('moneyStringsExact', () => {
    const data = demo('released');
    const { container } = render(<PresentCanvas data={data} nowMs={NOW} />);
    const text = container.textContent ?? '';

    expect(text).toContain('3.45');
    expect(text).toContain('3.00');
    expect(text).toContain('0.45');

    // No deducted figure: the pattern below also catches the deducted 3.00 - 0.45
    // figure that older drafts used, which cannot be named here because it is banned.
    expect(text).not.toMatch(/\b2\.\d\d\b/);

    // The whole demo surface, normal mode included, holds to the same figures.
    cleanup();
    const normal = render(<MissionControl data={data} />);
    expect(normal.container.textContent ?? '').not.toMatch(/\b2\.\d\d\b/);
  });
});
