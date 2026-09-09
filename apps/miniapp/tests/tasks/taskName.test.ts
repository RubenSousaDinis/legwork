import { describe, expect, it } from 'vitest';

const { QUESTION, taskName } = await import('../../components/TaskCard');

/**
 * The card prints the task type itself, beside the title. `titleOf` used to prefix the type
 * as well, so a phone read `verify-open · verify-open · Churrasqueira · Rua de Parceiros`,
 * and a task whose spec named no place read `verify-open · verify-open ·  · ` — an errand
 * with no visible subject at all. The title is the place now; this pins the two edges.
 */
const ROW = {
  task_id: '1',
  task_type: 'verify-open' as const,
  price_usdc: 3,
  state: 'open' as const,
  seeded: false,
};

describe('taskName', () => {
  it('is the place when the brief names one', () => {
    expect(taskName({ ...ROW, title: 'Churrasqueira · Rua de Parceiros' })).toBe(
      'Churrasqueira · Rua de Parceiros',
    );
  });

  it('falls back to the question when the spec named no place', () => {
    expect(taskName({ ...ROW, title: '' })).toBe(QUESTION['verify-open']);
  });

  it('never leaves the card without a subject', () => {
    for (const task_type of ['verify-open', 'photo-of', 'call-confirm', 'compare-two'] as const) {
      expect(taskName({ ...ROW, task_type, title: '' }).trim()).not.toBe('');
    }
  });
});
