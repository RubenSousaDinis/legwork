import type { LatLon } from './tiles';

/**
 * Nominatim, the same OpenStreetMap data the board tiles already use. No geocoder package:
 * one `fetch`, the coordinate stays on the phone — it is never sent to the API and never stored.
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export const GEOCODE_MIN_CHARS = 3;
export const GEOCODE_DEBOUNCE_MS = 400;

const PLACE_TYPES = new Set([
  'administrative',
  'city',
  'town',
  'municipality',
  'village',
  'suburb',
  'neighbourhood',
  'city_district',
]);

export type GeocodeHit = LatLon & {
  south: number;
  north: number;
  west: number;
  east: number;
};

export async function geocodeAddress(query: string): Promise<GeocodeHit | null> {
  const needle = query.trim();
  if (needle.length < GEOCODE_MIN_CHARS) return null;

  const url = new URL(NOMINATIM);
  url.searchParams.set('q', needle);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');

  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!Array.isArray(body) || body.length === 0) return null;
    const hit = pickHit(body);
    return hit;
  } catch {
    return null;
  }
}

function pickHit(hits: unknown[]): GeocodeHit | null {
  const parsed = hits.map(parseHit).filter((row): row is ParsedHit => row !== null);
  if (parsed.length === 0) return null;
  const place = parsed.find((row) => row.place) ?? parsed[0]!;
  return {
    lat: place.lat,
    lon: place.lon,
    south: place.south,
    north: place.north,
    west: place.west,
    east: place.east,
  };
}

type ParsedHit = GeocodeHit & { place: boolean };

function parseHit(raw: unknown): ParsedHit | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as {
    lat?: unknown;
    lon?: unknown;
    boundingbox?: unknown;
    class?: unknown;
    type?: unknown;
  };
  const lat = Number(row.lat);
  const lon = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const box = boundsOf(row.boundingbox) ?? padAround(lat, lon);
  const kind = typeof row.type === 'string' ? row.type : '';
  const cls = typeof row.class === 'string' ? row.class : '';
  const place = cls === 'boundary' || cls === 'place' || PLACE_TYPES.has(kind);
  return { lat, lon, place, ...box };
}

/** Nominatim order: south, north, west, east. */
function boundsOf(
  box: unknown,
): { south: number; north: number; west: number; east: number } | null {
  if (!Array.isArray(box) || box.length < 4) return null;
  const south = Number(box[0]);
  const north = Number(box[1]);
  const west = Number(box[2]);
  const east = Number(box[3]);
  if (![south, north, west, east].every(Number.isFinite)) return null;
  if (south > north) return null;
  return { south, north, west, east };
}

/** ~4 km, so a hit with no box never frames as a single street tile. */
function padAround(lat: number, lon: number): { south: number; north: number; west: number; east: number } {
  const pad = 0.04;
  return { south: lat - pad, north: lat + pad, west: lon - pad, east: lon + pad };
}
