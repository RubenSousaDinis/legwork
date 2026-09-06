import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { controlVisibility, recordRequests } from './requests';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));

const { http, HttpResponse } = await import('msw');
const { server } = await import('../../mocks/server');
const { TaskList } = await import('../../app/tasks/TaskList');

const TASKS_PATH = '/api/tasks';

let requests: ReturnType<typeof recordRequests>;
let visibility: ReturnType<typeof controlVisibility>;

beforeEach(() => {
  localStorage.clear();
  replace.mockClear();
  push.mockClear();
  requests = recordRequests();
  visibility = controlVisibility();
});

afterEach(() => {
  requests.stop();
  visibility.restore();
  vi.useRealTimers();
  cleanup();
});

describe('the task poll', () => {
  /**
   * Only `setInterval` is faked. msw answers over real promises and real timers, so faking
   * the whole clock deadlocks the very requests this test is counting.
   */
  function useIntervalClock(): void {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  }

  it('pollRendersTasks', async () => {
    useIntervalClock();
    render(<TaskList />);

    // Both rows land, and the seeded one says so in a chip reading exactly `seeded`.
    expect(await screen.findByText('Padaria Central · Rua de Alcobaça 12, Leiria')).toBeTruthy();
    expect(screen.getByText('Mercado Municipal · Largo 5 de Outubro, Leiria')).toBeTruthy();

    const seededChip = document.querySelector('[data-task="1025"] .lw-chip');
    expect(seededChip?.textContent).toBe('seeded');
    expect(document.querySelector('[data-task="1024"] .lw-chip')).toBeNull();

    expect(requests.count('GET', TASKS_PATH)).toBe(1);

    // 3 s later, the list has asked again.
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await waitFor(() => expect(requests.count('GET', TASKS_PATH)).toBe(2));

    // A phone in a pocket asks for nothing.
    visibility.set(true);
    await act(async () => {
      vi.advanceTimersByTime(9000);
    });
    expect(requests.count('GET', TASKS_PATH)).toBe(2);

    // …and asks again the moment it comes back.
    visibility.set(false);
    await waitFor(() => expect(requests.count('GET', TASKS_PATH)).toBe(3));
  });

  it('unauthorizedRedirects', async () => {
    server.use(
      http.get('*/api/tasks', () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })),
    );

    render(<TaskList />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });
});
