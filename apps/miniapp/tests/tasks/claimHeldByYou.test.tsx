import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));

const { ALREADY_CLAIMED } = await import('../../mocks/handlers');
const { setScenario } = await import('../../mocks/scenarios');
const { TaskList, CLAIM_ERRORS, heldByYou } = await import('../../app/tasks/TaskList');

const TITLE = 'Padaria Central · Rua de Alcobaça 12, Leiria';

afterEach(() => {
  localStorage.clear();
  cleanup();
});

/**
 * `AlreadyClaimed` is the API's answer to two different situations, told apart only by
 * `active_task_id`: someone else claimed the task, or the caller already holds a claim of
 * their own. Both used to read "Someone claimed this task first." — which an operator holding
 * task 31 was shown about task 31, and went looking for a task they already had.
 */
describe('AlreadyClaimed', () => {
  it('names the task you are holding when the claim is your own', async () => {
    expect(ALREADY_CLAIMED.active_task_id).toBeTypeOf('string');
    setScenario({ claim: 'AlreadyClaimed' });

    render(<TaskList />);
    fireEvent.click((await screen.findByText(TITLE)).closest('button') as HTMLButtonElement);
    fireEvent.click(await screen.findByText('CLAIM'));

    await waitFor(() =>
      expect(screen.getByText(heldByYou(ALREADY_CLAIMED.active_task_id))).toBeTruthy(),
    );
    expect(screen.queryByText(CLAIM_ERRORS.AlreadyClaimed as string)).toBeNull();
  });

  it('still blames the other worker when there is no claim of your own', () => {
    expect(CLAIM_ERRORS.AlreadyClaimed).toBe('Someone claimed this task first.');
    expect(heldByYou('31')).toContain('#31');
  });
});
