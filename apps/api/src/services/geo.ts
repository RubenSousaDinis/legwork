/**
 * The two pieces of geometry this API needs, and the line between them.
 *
 * `round100m` is the only way a coordinate is allowed to leave the private `proofs` row:
 * three decimals is about 100 m, which places a worker in a neighbourhood and not at a
 * doorstep. `distanceM` is the geofence check's metre count and stays behind a session —
 * a distance from a known place is a coordinate with extra steps.
 *
 * GPS is self-reported and spoofable; we anchor it, geofence it, and dispute outside the
 * radius — we do not prove it.
 */
import { PUBLIC_COORD_DECIMALS } from '@legwork/shared';

export interface Coordinate {
  lat: number;
  lon: number;
}

/** `10 ** 3` — kept derived so the constant stays the single place the precision is set. */
const FACTOR = 10 ** PUBLIC_COORD_DECIMALS;

/** Mean Earth radius (IUGG), metres. */
const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Rounds each component to `PUBLIC_COORD_DECIMALS`, half away from zero, component by
 * component: `(39.74362, -8.80713)` becomes `(39.744, -8.807)`.
 */
export function round100m(lat: number, lon: number): Coordinate {
  return { lat: Math.round(lat * FACTOR) / FACTOR, lon: Math.round(lon * FACTOR) / FACTOR };
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceM(a: Coordinate, b: Coordinate): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
