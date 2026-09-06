import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));

const { TaskList } = await import('../../app/tasks/TaskList');

const TITLE = 'Padaria Central · Rua de Alcobaça 12, Leiria';

/** Before the fixture's `claim_expires_at` (10:22Z), so the claimed card has a live countdown. */
const CLAIMED_AT = '2026-09-06T09:52:00.000Z';

/** Phone floors: nothing tappable under 44 px, nothing narrated under 20 px. */
const TAPPABLE = 'button, a';

function assertHitTargets(where: string): void {
  const nodes = Array.from(document.querySelectorAll(TAPPABLE));
  expect(nodes.length, where).toBeGreaterThan(0);
  for (const node of nodes) {
    expect(node.getAttribute('data-hit'), `${where}: ${node.textContent?.slice(0, 40)}`).toBe('44');
  }
}

/**
 * `data-floor` may sit on the element or on the wrapper that carries the type size — the `lg`
 * button sets its own `font-size` at equal specificity, so the marker goes on the wrapper
 * (the same shape T-24's landing CTA uses).
 */
function assertNarrated(node: Element | null | undefined, what: string): void {
  expect(node, what).toBeTruthy();
  const marked =
    node?.getAttribute('data-floor') === '20' || node?.closest('[data-floor="20"]') !== null;
  expect(marked, what).toBe(true);
}

beforeEach(() => {
  localStorage.clear();
  replace.mockClear();
  push.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('phone floors', () => {
  it('hitTargetsAtLeast44', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(CLAIMED_AT) });

    render(<TaskList />);
    const summary = await screen.findByText(TITLE);

    // --- collapsed
    assertHitTargets('collapsed');
    assertNarrated(document.querySelector('[data-price="usdc"]'), 'collapsed price');
    for (const chip of document.querySelectorAll('.lw-chip')) {
      assertNarrated(chip, `collapsed chip: ${chip.textContent}`);
    }

    // --- expanded
    fireEvent.click(summary.closest('button') as HTMLButtonElement);
    const claimButton = await screen.findByText('CLAIM');
    assertHitTargets('expanded');
    assertNarrated(claimButton, 'CLAIM');
    for (const chip of document.querySelectorAll('.lw-chip')) {
      assertNarrated(chip, `expanded chip: ${chip.textContent}`);
    }

    // --- claimed
    fireEvent.click(claimButton);
    const card = await waitFor(() => {
      const node = document.querySelector('[data-claimed="true"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    assertHitTargets('claimed');
    assertNarrated(card.querySelector('[data-price="usdc"]'), 'claimed price');
    assertNarrated(card.querySelector('.lw-task-title'), 'claimed title');
    assertNarrated(card.querySelector('[data-countdown] span:last-child'), 'countdown');
    for (const chip of document.querySelectorAll('.lw-chip')) {
      assertNarrated(chip, `claimed chip: ${chip.textContent}`);
    }
  });
});
