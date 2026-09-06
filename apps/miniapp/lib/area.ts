// @ts-expect-error `ngeohash` ships no type declarations and `@types/ngeohash` is not in the
// pnpm catalog (DEP REQUEST in the PR). Delete this line when the types land — TypeScript
// reports an unused `@ts-expect-error`, so it cannot rot silently.
import ngeohash from 'ngeohash';

/**
 * Where the worker is, at the only precision a public surface ever sees. A geohash-5 cell is
 * roughly 5 × 5 km, which is what `GET /tasks` filters on; the exact coordinate stays on the
 * phone and, later, in the private task record. Nothing here writes a coordinate anywhere.
 */

/** Leiria — the demo's home cell, and the answer whenever the phone will not give a fix. */
export const DEFAULT_AREA = 'ez5ku';

/** `Geohash5` in the API contract: five characters, base32 without a, i, l or o. */
const GEOHASH_PRECISION = 5;

const DEFAULT_TIMEOUT_MS = 5000;

export type Position = { lat: number; lon: number };

/**
 * The last fix `resolveArea()` obtained, for the callers that need a distance (T-25 sends it
 * to `GET /tasks`). Module state, never persisted: it dies with the tab.
 */
let lastPosition: Position | null = null;

export function lastKnownPosition(): Position | null {
  return lastPosition;
}

export function areaFromPosition(lat: number, lon: number): string {
  return ngeohash.encode(lat, lon, GEOHASH_PRECISION) as string;
}

/**
 * One attempt at `getCurrentPosition`, then the default. A worker who declines the permission
 * prompt still gets a task list — they just get the Leiria cell instead of their own.
 */
export function resolveArea(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(DEFAULT_AREA);
  }

  return new Promise<string>((resolve) => {
    let settled = false;
    const finish = (area: string) => {
      if (settled) return;
      settled = true;
      resolve(area);
    };

    // Belt and braces: some webviews never call either callback of `getCurrentPosition`.
    const timer = setTimeout(() => finish(DEFAULT_AREA), timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        const { latitude, longitude } = position.coords;
        lastPosition = { lat: latitude, lon: longitude };
        finish(areaFromPosition(latitude, longitude));
      },
      () => {
        clearTimeout(timer);
        finish(DEFAULT_AREA);
      },
      { timeout: timeoutMs, maximumAge: 0, enableHighAccuracy: true },
    );
  });
}
