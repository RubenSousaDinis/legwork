import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geolocationAt, geolocationFailing, GEO_ERROR, stubGeolocation } from '../proof/harness';
import { recordRequests } from './requests';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));

const { http, HttpResponse } = await import('msw');
const { server } = await import('../../mocks/server');
const { TASK_PLACE_COORDS, TASKS_TWO_ROWS } = await import('../../mocks/handlers');
const { GPS_UNAVAILABLE_CHIP, TaskList } = await import('../../app/tasks/TaskList');
const { ODBL_LINE, TILES_FAILED } = await import('../../components/TaskMap');

const PADARIA = 'Padaria Central · Rua de Alcobaça 12, Leiria';
const PLACE = TASK_PLACE_COORDS['1024']!;

function round100m(lat: number, lon: number): { lat: number; lon: number } {
  return { lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000 };
}

function rowsWithCoordinates() {
  return TASKS_TWO_ROWS.tasks.map((row) => {
    const place = TASK_PLACE_COORDS[row.task_id];
    return place === undefined ? row : { ...row, coordinate_rounded: round100m(place.lat, place.lon) };
  });
}

function serveBoard(): void {
  server.use(
    http.get('*/api/tasks/list', () => HttpResponse.json({ tasks: rowsWithCoordinates() })),
  );
}

let requests: ReturnType<typeof recordRequests>;

beforeEach(() => {
  localStorage.clear();
  replace.mockClear();
  push.mockClear();
  requests = recordRequests();
  serveBoard();
});

afterEach(() => {
  requests.stop();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
  cleanup();
});

describe('the board map', () => {
  it('mapPinsEveryTaskAndTheWorker', async () => {
    stubGeolocation(geolocationAt(PLACE.lat, PLACE.lon, 12));
    render(<TaskList />);

    expect(await screen.findByText(PADARIA)).toBeTruthy();

    await waitFor(() => {
      expect(document.querySelectorAll('[data-pin="task"]').length).toBe(2);
    });
    expect(document.querySelector('[data-pin="worker"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-pin="worker"]').length).toBe(1);

    const pin = document.querySelector('[data-pin="task"][data-task="1024"]') as HTMLButtonElement;
    fireEvent.click(pin);

    const card = document.querySelector('li[data-task="1024"]') as HTMLElement;
    expect(card.querySelector('[aria-expanded="true"]')).not.toBeNull();
    expect(pin.className).toContain('lw-map-pin--selected');
  });

  it('mapDegradesWithoutAFixOrTiles', async () => {
    stubGeolocation(geolocationFailing(GEO_ERROR.TIMEOUT));
    render(<TaskList />);

    expect(await screen.findByText(PADARIA)).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[data-map="tasks"]')).not.toBeNull());

    expect(document.querySelector('[data-pin="worker"]')).toBeNull();
    expect(screen.getAllByText(GPS_UNAVAILABLE_CHIP).length).toBeGreaterThan(0);

    const tile = document.querySelector('[data-tile]') as HTMLImageElement;
    expect(tile).toBeTruthy();
    fireEvent.error(tile);

    expect(await screen.findByText(TILES_FAILED)).toBeTruthy();
    expect(document.querySelector('[data-map="tiles-failed"]')?.textContent).toBe(TILES_FAILED);
    const map = document.querySelector('[data-map="tasks"]') as HTMLElement;
    expect(map.textContent).toContain(TILES_FAILED);
    expect(map.querySelector('[data-map="odbl"]')).not.toBeNull();
  });

  it('mapCarriesTheOdblAttribution', async () => {
    render(<TaskList />);
    expect(await screen.findByText(PADARIA)).toBeTruthy();
    const attr = await screen.findByText(ODBL_LINE);
    expect(attr).toBeTruthy();
    expect(attr.getAttribute('data-map')).toBe('odbl');
    expect(ODBL_LINE).toContain('OpenStreetMap');
    expect(ODBL_LINE).toContain('ODbL');
  });
});
