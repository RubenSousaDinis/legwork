import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geolocationFailing, GEO_ERROR, stubGeolocation } from '../proof/harness';
import { recordRequests } from './requests';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));

const { http, HttpResponse } = await import('msw');
const { server } = await import('../../mocks/server');
const { TASKS_TWO_ROWS } = await import('../../mocks/handlers');
const { TaskList, NEAR_ME_LABEL, NEAR_ME_NEEDS_FIX } = await import('../../app/tasks/TaskList');

const PADARIA = 'Padaria Central · Rua de Alcobaça 12, Leiria';
const MERCADO = 'Mercado Municipal · Largo 5 de Outubro, Leiria';
const TASKS_PATH = '/api/tasks/list';

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

describe('board search', () => {
  it('searchMatchesPlaceAndType', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    render(<TaskList />);

    expect(await screen.findByText(PADARIA)).toBeTruthy();
    expect(screen.getByText(MERCADO)).toBeTruthy();
    const before = requests.count('GET', TASKS_PATH);

    const box = screen.getByRole('searchbox');

    fireEvent.change(box, { target: { value: 'Leiria' } });
    expect(screen.getByText(PADARIA)).toBeTruthy();
    expect(screen.getByText(MERCADO)).toBeTruthy();

    fireEvent.change(box, { target: { value: 'Alcobaça' } });
    expect(screen.getByText(PADARIA)).toBeTruthy();
    expect(screen.queryByText(MERCADO)).toBeNull();

    fireEvent.change(box, { target: { value: 'alcobaca' } });
    expect(screen.getByText(PADARIA)).toBeTruthy();

    fireEvent.change(box, { target: { value: 'Largo 5 de Outubro' } });
    expect(screen.queryByText(PADARIA)).toBeNull();
    expect(screen.getByText(MERCADO)).toBeTruthy();

    fireEvent.change(box, { target: { value: 'Mercado Municipal' } });
    expect(screen.getByText(MERCADO)).toBeTruthy();
    expect(screen.queryByText(PADARIA)).toBeNull();

    fireEvent.change(box, { target: { value: 'photo-of' } });
    expect(screen.getByText(MERCADO)).toBeTruthy();
    expect(screen.queryByText(PADARIA)).toBeNull();

    fireEvent.change(box, { target: { value: 'VERIFY-OPEN' } });
    expect(screen.getByText(PADARIA)).toBeTruthy();
    expect(screen.queryByText(MERCADO)).toBeNull();

    // The query stays out of the fetch path: typing must not rebuild the 3 s poll.
    expect(requests.count('GET', TASKS_PATH)).toBe(before);
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await waitFor(() => expect(requests.count('GET', TASKS_PATH)).toBe(before + 1));
  });

  it('nearMeFiltersToTenKilometres', async () => {
    const farRow = {
      ...TASKS_TWO_ROWS.tasks[1],
      task_id: '1098',
      title: 'Far bakery · Rua Distante 1, Leiria',
      distance_m: 20_000,
    };

    server.use(
      http.get('*/api/tasks/list', () =>
        HttpResponse.json({
          tasks: [
            { ...TASKS_TWO_ROWS.tasks[0], distance_m: 500 },
            { ...farRow },
          ],
        }),
      ),
    );

    render(<TaskList />);
    expect(await screen.findByText(PADARIA)).toBeTruthy();
    expect(screen.getByText(farRow.title)).toBeTruthy();

    const box = document.querySelector('[data-near="10km"]') as HTMLInputElement;
    expect(box.disabled).toBe(false);
    expect(box.getAttribute('data-hit')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: NEAR_ME_LABEL }));

    expect(box.checked).toBe(true);
    expect(screen.getByText(PADARIA)).toBeTruthy();
    expect(screen.queryByText(farRow.title)).toBeNull();

    cleanup();
    stubGeolocation(geolocationFailing(GEO_ERROR.TIMEOUT));
    server.resetHandlers();

    render(<TaskList />);
    expect(await screen.findByText(PADARIA)).toBeTruthy();
    const disabled = document.querySelector('[data-near="10km"]') as HTMLInputElement;
    expect(disabled.disabled).toBe(true);
    expect(screen.getByText(NEAR_ME_NEEDS_FIX)).toBeTruthy();
    expect(screen.getByText(NEAR_ME_LABEL)).toBeTruthy();
  });
});
