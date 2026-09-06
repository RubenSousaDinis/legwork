import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  recordBodies,
  recordRequests,
  renderPage,
  useImageHandlers,
  useSpecHandler,
  type RequestLog,
} from './harness';
import SPEC_IMAGES from './fixtures/spec-images.json';
import SPEC_TEXTS from './fixtures/spec-texts.json';

const replace = vi.fn();
/** One stable object, as `useRouter()` hands back in the app: a fresh one every render would
    re-fire every effect that lists the router and never settle. */
const router = { replace, push: replace };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const { CompareTwoProof, CompareTwoSpec } = await import('@legwork/shared');
const { SUBMIT_RESPONSE } = await import('../../mocks/handlers');
const { setScenario } = await import('../../mocks/scenarios');
const { ACTIVE_CLAIM_KEY } = await import('../../app/tasks/activeClaim');
const { resetSessionForTests } = await import('../../lib/session');
const { ComparePaidState } = await import('../../app/compare/[id]/ComparePaidState');
const ComparePage = (await import('../../app/compare/[id]/page')).default;

/**
 * The travel-free type, end to end: the pair arrives from the claimant-only spec route, the
 * worker picks a side and writes one line, and the receipt shows the judgement above the
 * money. No camera, no location, and no `POST /proofs` anywhere on the path.
 */

const TASK_ID = '1024';
const CLAIM = {
  task_id: TASK_ID,
  claim_expires_at: '2026-09-06T10:22:00.000Z',
  submit_deadline: '2026-09-06T10:52:00.000Z',
  tx: `0x${'0c1d2e3f405162738495a6b7c8d9eaf0'.repeat(2)}`,
};

/** The fixtures are parsed with the shared schema: a drifting fixture is a red test. */
const IMAGES = CompareTwoSpec.parse(SPEC_IMAGES);
const TEXTS = CompareTwoSpec.parse(SPEC_TEXTS);

const REASON = 'b shows the current hours sign';
const PAID_FOR_THE_JUDGEMENT =
  "you are paid for the judgement, not for a particular answer — 'neither' pays the same as 'a'";

let requests: { log: RequestLog; stop: () => void };
let submits: unknown[];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(ACTIVE_CLAIM_KEY, JSON.stringify(CLAIM));
  replace.mockClear();
  resetSessionForTests();
  requests = recordRequests();
  submits = recordBodies('submit', SUBMIT_RESPONSE);
});

afterEach(() => {
  requests.stop();
  cleanup();
});

async function openCompareScreen(spec: unknown): Promise<void> {
  useSpecHandler('compare-two', spec);
  renderPage(ComparePage, TASK_ID);
  // The screen is up once the spec has arrived and the pair has been drawn.
  await waitFor(() => expect(document.querySelector('[data-screen="compare"]')).not.toBeNull());
}

function tap(selector: string): void {
  fireEvent.click(document.querySelector(selector) as HTMLElement);
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'SUBMIT' }) as HTMLButtonElement;
}

function typeReason(text: string): void {
  const field = document.querySelector('[data-field="reason"]') as HTMLTextAreaElement;
  fireEvent.change(field, { target: { value: text } });
}

describe('compare-two', () => {
  it('compareSubmitsChoice', async () => {
    useImageHandlers([IMAGES.a.url ?? '', IMAGES.b.url ?? '']);
    setScenario({ task: 'released' });
    await openCompareScreen(IMAGES);

    // The pair, from the spec route and nowhere else.
    const images = Array.from(document.querySelectorAll('[data-pair="true"] img'));
    expect(images.map((node) => node.getAttribute('src'))).toEqual([IMAGES.a.url, IMAGES.b.url]);
    for (const node of images) {
      expect(node.getAttribute('loading')).toBe('eager');
      expect(node.getAttribute('referrerpolicy')).toBe('no-referrer');
    }
    expect(screen.getByText('Which is more legible?')).not.toBeNull();
    expect(screen.getByText(PAID_FOR_THE_JUDGEMENT)).not.toBeNull();
    expect(screen.getByText('no travel, no camera, no location for this task')).not.toBeNull();

    // Nothing is preselected, so nothing can be handed in yet.
    expect(submitButton().disabled).toBe(true);

    tap('[data-option="b"]');
    expect(submitButton().disabled).toBe(true);

    typeReason(REASON);
    expect(submitButton().disabled).toBe(false);

    fireEvent.click(submitButton());
    await waitFor(() => expect(submits.length).toBe(1));

    const body = submits[0] as Record<string, unknown>;
    expect(body.choice).toBe('b');
    expect(body.answer).toBe('b');
    expect(body.reason).toBe(REASON);
    expect(CompareTwoProof.safeParse(body).success).toBe(true);
    expect(body.proofHash).toBeUndefined();

    // The photo flow is a different task type. This one uploads nothing: the log is real —
    // it holds the spec read and the submit — and there is no `/proofs` line in it.
    expect(requests.log).toContain(`GET /tasks/${TASK_ID}/spec`);
    expect(requests.log).toContain(`POST /tasks/${TASK_ID}/submit`);
    expect(requests.log.filter((entry) => entry.includes('/proofs'))).toEqual([]);

    // The long poll lands on `released`, and the receipt puts the judgement above the money.
    const card = (await waitFor(() => {
      const node = document.querySelector('[data-paid-state="released"]');
      expect(node).not.toBeNull();
      return node;
    })) as HTMLElement;

    const chosen = card.querySelector('[data-option="b"][data-picked="true"]') as HTMLElement;
    const amount = card.querySelector('[data-released="usdc"]') as HTMLElement;
    expect(chosen).not.toBeNull();
    expect(
      chosen.compareDocumentPosition(amount) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(amount.textContent).toBe('Released · 3.00 USDC');
    expect(card.textContent).toContain('testnet USDC — not spendable');
    expect(card.textContent).toContain('+1 completed');
    // Never a deducted figure: no 2.55, and nothing else beginning `2.` either.
    expect(card.textContent).not.toMatch(/\b2\.\d/);
    expect(localStorage.getItem(ACTIVE_CLAIM_KEY)).toBeNull();
  });

  it('compareTextPair', async () => {
    await openCompareScreen(TEXTS);

    expect(screen.getByText(TEXTS.a.text ?? '')).not.toBeNull();
    expect(screen.getByText(TEXTS.b.text ?? '')).not.toBeNull();
    expect(document.querySelectorAll('img').length).toBe(0);
    expect(screen.getByText('Which is newer?')).not.toBeNull();

    // `neither` is a first-class answer, not a failure.
    tap('[data-option="neither"]');
    expect(
      (document.querySelector('[data-option="neither"]') as HTMLElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true');

    const field = document.querySelector('[data-field="reason"]') as HTMLTextAreaElement;
    expect(field.maxLength).toBe(120);
    typeReason('x'.repeat(121));
    expect(field.value.length).toBe(120);
    expect(document.querySelector('[data-counter="reason"]')?.textContent).toBe('120/120');

    cleanup();

    // The receipt renders nothing without a choice — escrow never releases on its own.
    const empty = render(
      <ComparePaidState
        a={TEXTS.a}
        amountUsdc={3}
        b={TEXTS.b}
        capturedAt=""
        choice={null}
        reason=""
        releaseTx={`0x${'3b6d9f0247ace13579bdf02468ace135'.repeat(2)}`}
      />,
    );
    expect(empty.container.textContent).toBe('');
    expect(empty.container.querySelector('[data-paid-state="none"]')).not.toBeNull();
    cleanup();

    const neither = render(
      <ComparePaidState
        a={TEXTS.a}
        amountUsdc={3}
        b={TEXTS.b}
        capturedAt="2026-09-06T10:03:00.000Z"
        choice="neither"
        reason="neither card is dated"
        releaseTx={`0x${'3b6d9f0247ace13579bdf02468ace135'.repeat(2)}`}
      />,
    );
    const word = neither.container.querySelector('[data-chosen="neither"]') as HTMLElement;
    const reason = neither.container.querySelector('[data-reason="true"]') as HTMLElement;
    const amount = neither.container.querySelector('[data-released="usdc"]') as HTMLElement;
    expect(word.textContent).toBe('neither');
    expect(reason.textContent).toBe('“neither card is dated”');
    for (const above of [word, reason]) {
      expect(above.compareDocumentPosition(amount) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});
