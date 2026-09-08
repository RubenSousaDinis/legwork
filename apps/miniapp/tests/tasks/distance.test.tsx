import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geolocationAt, geolocationFailing, GEO_ERROR, stubGeolocation } from '../proof/harness';
import { recordRequests } from './requests';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));

const { metresNorthOf, TASK_PLACE_COORDS } = await import('../../mocks/handlers');
const { TaskList } = await import('../../app/tasks/TaskList');

const TITLE = 'Padaria Central · Rua de Alcobaça 12, Leiria';
const GPS_CHIP = 'GPS unavailable in webview — disclosed';
const PLACE = TASK_PLACE_COORDS['1024']!;

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

describe('distance on the board', () => {
  it('coldOpenSendsAFixSoDistanceRenders', async () => {
    const fix = metresNorthOf(PLACE, 350);
    stubGeolocation(geolocationAt(fix.lat, fix.lon, 12));

    render(<TaskList />);

    expect(await screen.findByText(TITLE)).toBeTruthy();
    await waitFor(() => {
      const list = requests.seen().filter((entry) => entry.pathname === '/api/tasks/list');
      expect(list.length).toBeGreaterThan(0);
      expect(list[0]?.search).toMatch(/lat=/);
      expect(list[0]?.search).toMatch(/lon=/);
    });
    expect(document.querySelector('[data-distance]')?.textContent).toBe('~350 m');
    expect(screen.queryByText('—')).toBeNull();
  });

  it('noFixSaysSoRatherThanADash', async () => {
    stubGeolocation(geolocationFailing(GEO_ERROR.TIMEOUT));

    render(<TaskList />);

    expect(await screen.findByText(TITLE)).toBeTruthy();
    const distances = Array.from(document.querySelectorAll('[data-distance]'));
    expect(distances.length).toBeGreaterThan(0);
    for (const node of distances) {
      expect(node.textContent).toBe('distance unavailable');
    }
    expect(screen.getByText(GPS_CHIP)).toBeTruthy();
  });
});
