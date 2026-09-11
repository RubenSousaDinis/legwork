import type { LatLon } from './tiles';

/**
 * Nominatim, the same OpenStreetMap data the board tiles already use. No geocoder package:
 * one `fetch`, one result, and the coordinate stays on the phone — it is never sent to the
 * API and never stored.
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export const GEOCODE_MIN_CHARS = 3;
export const GEOCODE_DEBOUNCE_MS = 400;

export async function geocodeAddress(query: string): Promise<LatLon | null> {
  const needle = query.trim();
  if (needle.length < GEOCODE_MIN_CHARS) return null;

  const url = new URL(NOMINATIM);
  url.searchParams.set('q', needle);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');

  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!Array.isArray(body) || body.length === 0) return null;
    const first = body[0];
    if (typeof first !== 'object' || first === null) return null;
    const lat = Number((first as { lat?: unknown }).lat);
    const lon = Number((first as { lon?: unknown }).lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}
