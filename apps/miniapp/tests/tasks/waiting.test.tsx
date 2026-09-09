import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordRequests } from './requests';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));

const { setScenario } = await import('../../mocks/scenarios');
const { TaskList, LOOKING_FOR_TASKS, emptyBoardCopy } = await import('../../app/tasks/TaskList');

const TITLE = 'Padaria Central · Rua de Alcobaça 12, Leiria';
const CLAIMING_LINE = 'Claiming this task…';

let requests: ReturnType<typeof recordRequests>;

beforeEach(() => {
  localStorage.clear();
  replace.mockClear();
  push.mockClear();
  requests = recordRequests();
});

afterEach(() => {
  requests.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
  cleanup();
});

/**
 * What the phone says while it is waiting.
 *
 * Two things it must not do: say there are no tasks before it has asked for any, and take a
 * second tap on a claim it has already sent.
 */
describe('the waiting states', () => {
  it('boardDoesNotClaimEmptyBeforeItHasAsked', async () => {
    setScenario({ tasks: 'empty' });
    render(<TaskList />);

    // First paint: `rows` is empty because nothing has been read, not because the board is.
    expect(screen.getByText(LOOKING_FOR_TASKS)).toBeTruthy();
    expect(screen.queryByText(emptyBoardCopy())).toBeNull();

    const waiting = screen.getByText(LOOKING_FOR_TASKS).closest('[data-waiting]') as HTMLElement;
    expect(waiting.getAttribute('role')).toBe('status');
    expect(waiting.getAttribute('data-floor')).toBe('20');

    // Once the API has answered, the empty board is a fact and the wait is gone.
    expect(await screen.findByText(emptyBoardCopy())).toBeTruthy();
    expect(screen.queryByText(LOOKING_FOR_TASKS)).toBeNull();
  });

  it('claimTakesOneTapWhileItIsInFlight', async () => {
    render(<TaskList />);

    const summary = await screen.findByText(TITLE);
    fireEvent.click(summary.closest('button') as HTMLButtonElement);

    const button = (await screen.findByText('CLAIM')) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    // A relayed claim takes seconds. The button stops taking taps and says why.
    expect(button.disabled).toBe(true);
    expect(screen.getByText(CLAIMING_LINE)).toBeTruthy();
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(screen.queryByText(CLAIMING_LINE)).toBeNull());
    expect(requests.count('POST', '/api/tasks/1024/claim')).toBe(1);
  });
});
