import ngeohash from 'ngeohash';

/**
 * Where the worker is, at the only precision a public surface ever sees. A geohash-5 cell is
 * roughly 5 × 5 km, which is what `GET /tasks` filters on; the exact coordinate stays on the
 * phone and, later, in the private task record. Nothing here writes a coordinate anywhere.
 */

/**
 * Leiria — the demo's home cell, and the answer whenever the phone will not give a fix.
 * `ngeohash.encode(39.744, -8.807, 5)`; the `ez5ku` the briefs carry is 300 km inland.
 */
export const DEFAULT_AREA = 'ez1dp';

/** `Geohash5` in the API contract: five characters, base32 without a, i, l or o. */
const GEOHASH_PRECISION = 5;

const DEFAULT_TIMEOUT_MS = 5000;

const REGISTERED_AREA_KEY = 'legwork.registeredArea.v1';

export type Position = { lat: number; lon: number };

export type AreaSource = 'gps' | 'default';

/**
 * The last fix `resolveArea()` obtained, for the callers that need a distance (T-25 sends it
 * to `GET /tasks`). Module state, never persisted: it dies with the tab.
 */
let lastPosition: Position | null = null;
let lastSource: AreaSource = 'default';

export function lastKnownPosition(): Position | null {
  return lastPosition;
}

/** Whether the last `resolveArea()` came from a fix or from `DEFAULT_AREA`. */
export function lastAreaSource(): AreaSource {
  return lastSource;
}

export function areaFromPosition(lat: number, lon: number): string {
  return ngeohash.encode(lat, lon, GEOHASH_PRECISION) as string;
}

/** The cell `POST /register` bound. Survives a tab close; cleared with site data. */
export function rememberRegisteredArea(area: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REGISTERED_AREA_KEY, area);
}

export function readRegisteredArea(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(REGISTERED_AREA_KEY);
  return raw !== null && /^[0-9b-hjkmnp-z]{5}$/.test(raw) ? raw : null;
}

/** Tests reset the module store between renders; nothing in the app calls this. */
export function resetAreaForTests(): void {
  lastPosition = null;
  lastSource = 'default';
}

/**
 * One attempt at `getCurrentPosition`, then the default. A worker who declines the permission
 * prompt still gets a task list — they just get the Leiria cell instead of their own.
 */
export function resolveArea(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    lastSource = 'default';
    return Promise.resolve(DEFAULT_AREA);
  }

  return new Promise<string>((resolve) => {
    let settled = false;
    const finish = (area: string, source: AreaSource) => {
      if (settled) return;
      settled = true;
      lastSource = source;
      resolve(area);
    };

    // Belt and braces: some webviews never call either callback of `getCurrentPosition`.
    const timer = setTimeout(() => finish(DEFAULT_AREA, 'default'), timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        const { latitude, longitude } = position.coords;
        lastPosition = { lat: latitude, lon: longitude };
        finish(areaFromPosition(latitude, longitude), 'gps');
      },
      () => {
        clearTimeout(timer);
        finish(DEFAULT_AREA, 'default');
      },
      { timeout: timeoutMs, maximumAge: 0, enableHighAccuracy: true },
    );
  });
}
