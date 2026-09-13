import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geolocationAt, stubGeolocation } from '../proof/harness';
import { recordRequests } from './requests';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));

const { http, HttpResponse } = await import('msw');
const { server } = await import('../../mocks/server');
const { metresNorthOf, TASK_PLACE_COORDS, TASKS_BOARD, TASKS_TWO_ROWS } = await import(
  '../../mocks/handlers'
);
const { setScenario } = await import('../../mocks/scenarios');
const { rememberRegisteredArea } = await import('../../lib/area');
const { TaskList, emptyBoardCopy, emptySearchCopy } = await import('../../app/tasks/TaskList');
const { DIRECTIONS_LABEL, directionsHref } = await import(
  '../../components/TaskCard'
);

const TITLE = 'Padaria Central · Rua de Alcobaça 12, Leiria';
const LISBON_TITLE = 'Pastelaria Versailles · Avenida da República 15, Lisboa';
const PLACE = TASK_PLACE_COORDS['1024']!;

const LISBON_ROW = {
  task_id: '1099',
  task_type: 'verify-open' as const,
  title: LISBON_TITLE,
  price_usdc: 3.0,
  state: 'open' as const,
  seeded: false,
  brief: {
    place: {
      name: 'Pastelaria Versailles',
      street_address: 'Avenida da República 15',
      locality: 'Lisboa',
    },
  },
};

let requests: ReturnType<typeof recordRequests>;

beforeEach(() => {
  localStorage.clear();
  replace.mockClear();
  push.mockClear();
  requests = recordRequests();
});

afterEach(() => {
  requests.stop();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
  cleanup();
});

describe('the global board', () => {
  it('boardShowsTasksBeyondTheRegisteredCell', async () => {
    rememberRegisteredArea('ez19y');
    server.use(
      http.get('*/api/tasks/list', () =>
        HttpResponse.json({ tasks: [...TASKS_TWO_ROWS.tasks, LISBON_ROW] }),
      ),
    );

    render(<TaskList />);

    expect(await screen.findByText(LISBON_TITLE)).toBeTruthy();
    expect(screen.getByText(TITLE)).toBeTruthy();

    await waitFor(() => {
      const list = requests.seen().filter((entry) => entry.pathname === '/api/tasks/list');
      expect(list.length).toBeGreaterThan(0);
      expect(list[0]?.search).not.toMatch(/[?&]area=/);
    });
  });

  it('emptyBoardNoLongerPromisesOneCell', async () => {
    setScenario({ tasks: 'empty' });
    render(<TaskList />);

    const empty = await screen.findByText(emptyBoardCopy());
    expect(empty.textContent).not.toMatch(/registered/);
    expect(empty.textContent).not.toMatch(/ez1dp/);
    expect(empty.textContent).not.toMatch(/cell you registered in/);
    expect(empty.textContent).not.toMatch(/posted elsewhere/);

    cleanup();
    setScenario({ tasks: 'two_rows' });
    render(<TaskList />);
    expect(await screen.findByText(TITLE)).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz-no-match' } });
    const searchEmpty = await screen.findByText(emptySearchCopy());
    expect(searchEmpty.textContent).not.toBe(emptyBoardCopy());
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('rowsBeyondTheClaimRadiusStaySeenButUnclaimable', async () => {
    const fix = metresNorthOf(PLACE, 4000);
    stubGeolocation(geolocationAt(fix.lat, fix.lon, 12));

    render(<TaskList />);
    const summary = await screen.findByText(TITLE);
    expect(summary).toBeTruthy();
    fireEvent.click(summary.closest('button') as HTMLButtonElement);

    const button = await screen.findByText('CLAIM');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Too far to claim — you are ~4\.0 km away/)).toBeTruthy();
  });

  it('directionsLinkOpensTheAddress', async () => {
    render(<TaskList />);
    expect(await screen.findByText(TITLE)).toBeTruthy();

    const links = Array.from(document.querySelectorAll('[data-directions="true"]')) as HTMLAnchorElement[];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const card = link.closest('[data-task]') as HTMLElement;
      const id = card.getAttribute('data-task');
      // The whole board, Leiria and the three seeded cities alike: every card with a place
      // links to that place's address, and none of them links to a coordinate.
      const row = TASKS_BOARD.tasks.find((task) => task.task_id === id);
      expect(row?.brief.place).toBeDefined();
      expect(link.getAttribute('href')).toBe(directionsHref(row!.brief.place));
      expect(link.getAttribute('href')).toContain('maps/dir/?api=1&destination=');
      expect(link.getAttribute('href')).not.toMatch(/-?\d+\.\d{3,}/);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noreferrer');
      expect(link.getAttribute('data-hit')).toBe('44');
      expect(link.textContent).toBe(DIRECTIONS_LABEL);
    }
  });
});
