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
const { GPS_UNAVAILABLE_CHIP, TaskList, emptySearchCopy } = await import('../../app/tasks/TaskList');
const { MAP_NO_COORDINATES, ODBL_LINE, TaskMap, TILES_FAILED } = await import('../../components/TaskMap');

const PADARIA = 'Padaria Central · Rua de Alcobaça 12, Leiria';
const PLACE = TASK_PLACE_COORDS['1024']!;
const LISBON_BOX = ['38.6913994', '38.7967584', '-9.2298356', '-9.0863328'];
const LISBON_HIT = {
  lat: '38.7223',
  lon: '-9.1393',
  boundingbox: LISBON_BOX,
  class: 'boundary',
  type: 'administrative',
};

function tileZoom(node: Element | null): number {
  const id = node?.getAttribute('data-tile') ?? '';
  return Number(id.split('/')[0]);
}

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
  it('mapSaysWhenNoRowCarriesACoordinate', () => {
    // Rows with no coordinate used to render an empty frame and nothing else, which reads as
    // broken rather than as "the API sent no location for these".
    const { container } = render(
      <TaskMap
        gpsUnavailableChip="GPS unavailable in webview — disclosed"
        located={false}
        onSelect={() => {}}
        rows={[{ task_id: '1', title: 'Is it open right now?' }]}
        selectedId={null}
        worker={null}
      />,
    );
    expect(container.textContent).toContain(MAP_NO_COORDINATES);
    expect(container.querySelectorAll('[data-pin]')).toHaveLength(0);
  });

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

  it('searchRecentersTheMap', async () => {
    const lisbon = { lat: 38.722, lon: -9.139 };
    stubGeolocation(geolocationAt(PLACE.lat, PLACE.lon, 12));
    server.use(
      http.get('*/api/tasks/list', () =>
        HttpResponse.json({
          tasks: [
            { ...TASKS_TWO_ROWS.tasks[0], coordinate_rounded: round100m(PLACE.lat, PLACE.lon) },
            {
              ...TASKS_TWO_ROWS.tasks[1],
              task_id: '1099',
              title: 'Pastelaria Versailles · Avenida da República 15, Lisboa',
              brief: {
                place: {
                  name: 'Pastelaria Versailles',
                  street_address: 'Avenida da República 15',
                  locality: 'Lisboa',
                },
              },
              coordinate_rounded: lisbon,
            },
          ],
        }),
      ),
      http.get('https://nominatim.openstreetmap.org/search', () => HttpResponse.json([LISBON_HIT])),
    );

    render(<TaskList />);
    expect(await screen.findByText(PADARIA)).toBeTruthy();
    await waitFor(() => expect(document.querySelectorAll('[data-pin="task"]').length).toBe(2));

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Lisboa' } });

    await waitFor(() => {
      expect(document.querySelectorAll('[data-pin="task"]').length).toBe(1);
      expect(document.querySelector('[data-pin="task"][data-task="1099"]')).not.toBeNull();
      expect(tileZoom(document.querySelector('[data-tile]'))).toBeLessThan(15);
    });
  });

  it('searchForACityUsesTheCityBounds', async () => {
    stubGeolocation(geolocationAt(PLACE.lat, PLACE.lon, 12));
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', () => HttpResponse.json([LISBON_HIT])),
    );

    render(<TaskList />);
    expect(await screen.findByText(PADARIA)).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[data-tile]')).not.toBeNull());

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Lisboa' } });
    expect(await screen.findByText(emptySearchCopy())).toBeTruthy();

    await waitFor(() => {
      expect(document.querySelector('[data-pin="search"]')).not.toBeNull();
      expect(tileZoom(document.querySelector('[data-tile]'))).toBeLessThan(15);
    });
  });

  it('mapPinchAndWheelChangeTheZoom', async () => {
    stubGeolocation(geolocationAt(PLACE.lat, PLACE.lon, 12));
    render(<TaskList />);
    expect(await screen.findByText(PADARIA)).toBeTruthy();
    const map = await waitFor(() => {
      const node = document.querySelector('[data-map="tasks"]') as HTMLElement;
      expect(node.getAttribute('data-zoom')).toBeTruthy();
      return node;
    });
    const before = Number(map.getAttribute('data-zoom'));

    fireEvent.wheel(map, { deltaY: -120, clientX: 100, clientY: 100 });

    await waitFor(() => {
      expect(Number(map.getAttribute('data-zoom'))).toBe(before + 1);
    });

    fireEvent.wheel(map, { deltaY: 120, clientX: 100, clientY: 100 });
    await waitFor(() => {
      expect(Number(map.getAttribute('data-zoom'))).toBe(before);
    });
  });

  it('searchPansToAGeocodedAddress', async () => {
    stubGeolocation(geolocationAt(PLACE.lat, PLACE.lon, 12));
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', () =>
        HttpResponse.json([
          {
            lat: '41.1496',
            lon: '-8.6109',
            boundingbox: ['41.1384', '41.1856', '-8.6910', '-8.5564'],
            class: 'boundary',
            type: 'administrative',
          },
        ]),
      ),
    );

    render(<TaskList />);
    expect(await screen.findByText(PADARIA)).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[data-tile]')).not.toBeNull());
    const before = document.querySelector('[data-tile]')?.getAttribute('data-tile');

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Porto São Bento' } });
    expect(await screen.findByText(emptySearchCopy())).toBeTruthy();

    await waitFor(() => {
      expect(document.querySelector('[data-pin="search"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-tile]')?.getAttribute('data-tile')).not.toBe(before);
  });
});
