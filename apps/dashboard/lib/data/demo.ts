import {
  DemoData,
  fromUsdcUnits,
  priceWithFee,
  specHash,
  toUsdcUnits,
  type AbuseClass,
  type TaskType,
} from '@legwork/shared';
import demoJson from '../../../../demo-data.json';
import type {
  DashboardData,
  FeaturedState,
  FeaturedTask,
  PoolRow,
  ScreeningLine,
  TaskRowData,
  TaskRowState,
} from './types';

/**
 * `demo-data.json` is a read-only import: this adapter never writes it and never
 * retypes the money figures out of it. Two fields the brief warned about are absent
 * from the schema and are filled with defaults here, not invented:
 *   - no `posterStats` block  -> zeros, until T-26 reads `/public/*`
 *   - no per-row `agent_pays` -> `priceWithFee` in 6-decimal integer units
 * The featured row is the exception: its four figures come from the `money` block.
 */

/** Anchors `postedAt` so the elapsed timer reads `t+04:12` the moment the canvas loads. */
const ELAPSED_ANCHOR_S = 252;
/** How long before "now" the demo proof was captured. Only used when a proof exists. */
const PROOF_CAPTURED_BEFORE_NOW_S = 62;

const PLACE_LABEL = 'Farmácia Central · Rua Direita 12, Leiria';

/** Titles are bounded descriptions of the errand — never the raw spec text. */
const ROW_TITLES: Record<TaskType, string> = {
  'verify-open': `Is it open now — ${PLACE_LABEL}`,
  'photo-of': 'Photo of the posted opening hours — Leiria',
  'call-confirm': 'Confirm by phone — Leiria',
  'compare-two': 'Compare two shelf prices — Leiria',
};

/** The classifier's one-line reasons. The spec text itself is never rendered. */
const REFUSAL_REASON =
  'asks the worker to read a one-time code aloud from another person handset';
const FREE_TEXT_REASON = 'free text with no bounded errand — nothing to price or verify';
const PASSED_REASON = 'schema ok · placeId resolved';

/** A sample of the seeded pool. The pool chip stays the only total on screen. */
const SEEDED_POOL_SAMPLE: ReadonlyArray<{ id: string; completed: number }> = [
  { id: '#w-0512', completed: 12 },
  { id: '#w-0688', completed: 9 },
  { id: '#w-0733', completed: 15 },
  { id: '#w-0841', completed: 7 },
  { id: '#w-0904', completed: 18 },
  { id: '#w-0967', completed: 11 },
];

/** A real keccak hash of a stable demo key — no hex is invented by hand. */
function demoSpecHash(key: string): string {
  return specHash({ demo: key });
}

/** Fee-on-top, computed in integer units so no float rounding can leak a wrong cent. */
function agentPaysFor(amountUsdc: number): number {
  return fromUsdcUnits(priceWithFee(toUsdcUnits(amountUsdc)));
}

function isoAt(nowMs: number, secondsAgo: number): string {
  return new Date(nowMs - secondsAgo * 1000).toISOString();
}

/** A refused task moves no money, so a refused row holds none to render. */
function moneyFor(status: string, amountUsdc: number): { price: number; agentPays: number } {
  if (status === 'refused') return { price: 0, agentPays: 0 };
  return { price: amountUsdc, agentPays: agentPaysFor(amountUsdc) };
}

function metaFor(status: string, via: string | undefined, seeded: boolean): string {
  const parts: string[] = [];
  if (via) parts.push(`via ${via}`);
  if (seeded) parts.push('seeded demo row');
  if (status === 'refused') parts.push('no money moved');
  // The `call-confirm` disclosure is not appended here: `TaskRow` guarantees it for
  // every adapter, so the live rows T-26 builds cannot forget it.
  return parts.join(' · ');
}

export function demoDashboardData(
  opts: { state?: FeaturedState; nowMs?: number } = {},
): DashboardData {
  const d = DemoData.parse(demoJson);
  const nowMs = opts.nowMs ?? Date.now();
  const state: FeaturedState = opts.state ?? 'released';

  const feed: TaskRowData[] = d.feed.map((row, i) => {
    const { price, agentPays } = moneyFor(row.status, row.amount_usdc);
    const rowState: TaskRowState = row.status === 'refused' ? 'refused' : row.status;
    const base: TaskRowData = {
      taskId: `demo-${i + 1}`,
      type: row.task_type,
      title: ROW_TITLES[row.task_type],
      priceUsdc: price,
      agentPaysUsdc: agentPays,
      state: rowState,
      meta: metaFor(row.status, row.via, row.seeded),
      seeded: row.seeded,
    };
    if (row.status === 'refused') {
      base.refusal = { class: row.refusal_class ?? null, reason: REFUSAL_REASON };
    }
    if (row.status === 'released') base.tx = d.tx_placeholder;
    return base;
  });

  // The featured row is feed row 1 (the verify-open errand) with the money block's
  // figures, and its state comes from `?state=` so every meter beat can be previewed.
  const first = feed[0];
  const postedAt = isoAt(nowMs, ELAPSED_ANCHOR_S);
  const proofPresent = state !== 'locked';
  const featured: FeaturedTask | null = first
    ? {
        taskId: first.taskId,
        state,
        agentPays: d.money.agent_pays,
        escrowLocked: d.money.escrow_locked,
        workerReceives: d.money.worker_receives,
        fee: d.money.fee,
        postedAt,
        proofPresent,
        ...(state === 'released' ? { releaseTx: d.tx_placeholder } : {}),
        ...(proofPresent ? { proofCapturedAt: isoAt(nowMs, PROOF_CAPTURED_BEFORE_NOW_S) } : {}),
      }
    : null;

  // Totals are read off the rows, with the featured row following `?state=` rather
  // than its own. Refused rows are skipped: they never funded an escrow.
  const HOLDS_ESCROW: readonly string[] = ['locked', 'open', 'claimed', 'submitted', 'disputed'];
  const PAID_OUT: readonly string[] = ['released', 'resolved'];
  let lockedUsdc = 0;
  let releasedTodayUsdc = 0;
  let refundedUsdc = 0;
  for (const row of feed) {
    const isFeatured = featured !== null && row.taskId === featured.taskId;
    // `?state=` overrides the featured row's own state so every meter beat is previewable.
    const effective: string = isFeatured && featured ? featured.state : row.state;
    const escrowed = isFeatured && featured ? featured.escrowLocked : row.agentPaysUsdc;
    const toWorker = isFeatured && featured ? featured.workerReceives : row.priceUsdc;
    if (HOLDS_ESCROW.includes(effective)) lockedUsdc += escrowed;
    else if (PAID_OUT.includes(effective)) releasedTodayUsdc += toWorker;
    else if (effective === 'refunded') refundedUsdc += escrowed;
    // `refused` falls through: a refused task never funded an escrow.
  }

  const agentId = d.agent.handle.replace(/^#/, '');
  const refusalClass: AbuseClass | null = d.feed.find((r) => r.status === 'refused')?.refusal_class ?? null;

  const screening: ScreeningLine[] = [
    {
      at: isoAt(nowMs, 30),
      outcome: 'refused',
      taskType: 'call-confirm',
      class: refusalClass,
      reason: REFUSAL_REASON,
      specHash: demoSpecHash('refused-call-confirm'),
      marked: true,
      markTx: d.tx_placeholder,
      agentId,
    },
    {
      // Quieter: outside the six abuse classes, so it is a plain schema refusal
      // and never marks the agent.
      at: isoAt(nowMs, 96),
      outcome: 'refused',
      taskType: 'free-text',
      class: null,
      reason: FREE_TEXT_REASON,
      specHash: demoSpecHash('refused-free-text'),
      marked: false,
    },
    {
      at: isoAt(nowMs, 168),
      outcome: 'passed',
      taskType: 'verify-open',
      reason: PASSED_REASON,
      specHash: demoSpecHash('passed-verify-open'),
      marked: false,
    },
    {
      at: isoAt(nowMs, 240),
      outcome: 'passed',
      taskType: 'photo-of',
      reason: PASSED_REASON,
      specHash: demoSpecHash('passed-photo-of'),
      marked: false,
    },
  ];

  const marks = state === 'locked' ? 0 : 1;
  const poolRows: PoolRow[] = [
    { id: d.worker.handle, seeded: false, area: 'Leiria', completed: 1 },
    ...SEEDED_POOL_SAMPLE.map((w) => ({ ...w, seeded: true, area: 'Leiria' })),
  ];

  return {
    dataMode: 'demo',
    featured,
    totals: { lockedUsdc, releasedTodayUsdc, refundedUsdc },
    feed,
    agent: {
      id: agentId,
      label: 'Storefront checker',
      // `demo-data.json` carries no agent score, and a score is not invented here.
      score: null,
      paidOnProof: state === 'released' ? 1 : 0,
      marks,
      ...(marks > 0 && refusalClass ? { lastMarkClass: refusalClass } : {}),
    },
    pool: {
      real: d.worker_pool.real,
      seeded: d.worker_pool.seeded,
      // No real completion time exists in `demo-data.json`, so `minutesReal` is left
      // unset and the row renders without it rather than showing a made-up number.
      highlighted: {
        id: d.worker.handle,
        level: d.worker.credential === 'sandbox World ID' ? 'orb' : 'selfie',
      },
      rows: poolRows,
    },
    screening,
    preflight: {
      active: d.preflight.active,
      verified: d.preflight.verified,
      seeded: d.preflight.seeded,
      scoreFloor: d.preflight.score_floor,
      medianMinutes: d.preflight.median_minutes,
      medianSource: d.preflight.median_source,
      // One real completion on demo day — the released verify-open errand.
      nReal: d.worker_pool.real,
    },
    posterStats: { distinctExternalBuyers: 0, externalTasks: 0 },
    generatedAt: new Date(nowMs).toISOString(),
  };
}
