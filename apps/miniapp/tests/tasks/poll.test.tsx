import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { controlVisibility, recordRequests } from './requests';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));

const { http, HttpResponse } = await import('msw');
const { server } = await import('../../mocks/server');
const { TaskList } = await import('../../app/tasks/TaskList');

/** The route the API actually serves: `app/tasks/route.ts` is POST-only. */
const TASKS_PATH = '/api/tasks/list';

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

    // …and the poll went to the route the API serves, with the geohash-5 cell and no finer.
    expect(requests.count('GET', TASKS_PATH)).toBe(1);
    expect(requests.count('GET', '/api/tasks')).toBe(0);

    // The `photo-of` row's `brief.subject` is what the worker is actually asked to photograph,
    // so it renders under the type-derived question line.
    const seededRow = document.querySelector('[data-task="1025"]') as HTMLElement;
    fireEvent.click(seededRow.querySelector('button') as HTMLButtonElement);
    expect(seededRow.querySelector('[data-brief="subject"]')?.textContent).toBe(
      'the opening-hours sign at the main entrance',
    );
    expect(screen.getByText('Photograph the subject named in the title')).toBeTruthy();
    fireEvent.click(seededRow.querySelector('button') as HTMLButtonElement);

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
      http.get('*/api/tasks/list', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );

    render(<TaskList />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });
});
