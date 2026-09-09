import { afterEach, describe, expect, it } from 'vitest';

const { recoverClaim } = await import('../../app/tasks/TaskList');
const { ACTIVE_CLAIM_KEY, readActiveClaim } = await import('../../app/tasks/activeClaim');

const NOW = Date.parse('2026-09-09T12:10:00.000Z');

const OPEN = {
  task_id: '29',
  task_type: 'verify-open' as const,
  title: 'Churrasqueira · Rua de Parceiros',
  price_usdc: 3,
  state: 'open' as const,
  seeded: false,
};

const MINE = { ...OPEN, task_id: '31', state: 'claimed' as const, claim_expires_in_s: 1500 };

afterEach(() => localStorage.clear());

/**
 * `GET /tasks/list` marks a row `claimed` only for the caller's own live claim. The card read
 * that state from localStorage alone, so a phone that had forgotten the claim showed a CLAIM
 * button on a task it was already holding — and neither `Go to proof` nor `release this
 * claim` could be reached until the TTL ran out.
 */
describe('recoverClaim', () => {
  it('rebuilds the claim the API says is ours', () => {
    const claim = recoverClaim([OPEN, MINE], NOW);
    expect(claim?.task_id).toBe('31');
    expect(claim?.claim_expires_at).toBe('2026-09-09T12:35:00.000Z');
  });

  it('carries no receipt, because the row has none to give', () => {
    expect(recoverClaim([MINE], NOW)?.tx).toBe('');
  });

  it('leaves a claim the phone already remembers alone', () => {
    const stored = {
      task_id: '31',
      claim_expires_at: '2026-09-09T12:40:00.000Z',
      submit_deadline: '2026-09-09T12:40:00.000Z',
      tx: '0xabc',
    };
    localStorage.setItem(ACTIVE_CLAIM_KEY, JSON.stringify(stored));
    expect(recoverClaim([MINE], NOW)).toBeNull();
    expect(readActiveClaim()?.tx).toBe('0xabc');
  });

  it('recovers nothing from a board of open work', () => {
    expect(recoverClaim([OPEN], NOW)).toBeNull();
  });

  it('ignores a claim whose window has already run out', () => {
    expect(recoverClaim([{ ...MINE, claim_expires_in_s: 0 }], NOW)).toBeNull();
  });
});
