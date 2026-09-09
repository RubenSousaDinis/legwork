import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));

const { TaskCard, CLAIM_EXPIRED, CLAIM_STILL_HELD } = await import('../../components/TaskCard');

const PAST = '2026-09-09T12:37:34.000Z';
const CLAIM = { task_id: '31', claim_expires_at: PAST, submit_deadline: PAST, tx: '' };

const ROW = {
  task_id: '31',
  task_type: 'verify-open' as const,
  title: 'Pão Doce · Rua do Cruzeiro',
  price_usdc: 3,
  seeded: false,
};

function renderCard(state: 'claimed' | 'open', onRelease = vi.fn()) {
  render(
    <ul>
      <TaskCard
        claim={CLAIM}
        expanded
        onClaim={vi.fn()}
        onRelease={onRelease}
        onToggle={vi.fn()}
        row={{ ...ROW, state }}
      />
    </ul>,
  );
}

afterEach(cleanup);

/**
 * The claim window closing does not hand the task back — `expire` needs `claimedAt +
 * submitTTL` and nothing fires it by itself, so `activeClaimOf` still names the task and the
 * worker can claim nothing else. Telling them it "returned to the pool" and removing the
 * release button left an operator pinned to a task with no way out of it.
 */
describe('a claim past its window', () => {
  it('keeps the way out while the board still calls the row ours', () => {
    renderCard('claimed');
    expect(screen.getByText(CLAIM_STILL_HELD)).toBeTruthy();
    expect(screen.getByText('release this claim')).toBeTruthy();
    expect(screen.queryByText(CLAIM_EXPIRED)).toBeNull();
  });

  it('says it returned to the pool once the board agrees it did', () => {
    renderCard('open');
    expect(screen.getByText(CLAIM_EXPIRED)).toBeTruthy();
    expect(screen.queryByText('release this claim')).toBeNull();
  });
});
