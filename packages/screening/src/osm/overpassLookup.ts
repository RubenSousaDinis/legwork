import { OSM_PLACE_ID } from '@legwork/shared';
import type { Poi } from '../gate/place-index';
import { poiFromElement } from './buildExtract';

export type LookupResult =
  | { kind: 'found'; poi: Poi }
  | { kind: 'not_found' } // 200 with no usable element, or a non-business element
  | { kind: 'unavailable'; status?: number }; // non-200, network error, timeout, unparsable body

export type OverpassLookup = (placeId: string) => Promise<LookupResult>;

export interface OverpassLookupOptions {
  endpoint: string; // e.g. https://overpass-api.de/api/interpreter
  fetch?: typeof fetch; // injected in tests; defaults to globalThis.fetch
  timeoutMs?: number; // default 8000
  userAgent?: string; // default 'legwork-place-lookup/1.0 (+https://github.com/RubenSousaDinis/legwork)'
  now?: () => number; // for cache TTL tests
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_USER_AGENT = 'legwork-place-lookup/1.0 (+https://github.com/RubenSousaDinis/legwork)';
const FOUND_TTL_MS = 86400_000;
const NOT_FOUND_TTL_MS = 600_000;
const CACHE_CAP = 1000;

type CacheEntry = { expiresAt: number; result: LookupResult };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Only a number the mapper wrote with a leading `+` is trusted on a looked-up POI.
 * `poiFromElement` runs `normalizePhone`, which adds `+351` to a bare nine-digit string
 * because the packaged extract is Portuguese — that guess is wrong for a place anywhere
 * else, so a bare local number is dropped here.
 */
function applyLookupPhoneRule(poi: Poi, element: unknown): Poi {
  if (poi.phone === undefined || !isRecord(element)) return poi;
  const tags = isRecord(element['tags']) ? element['tags'] : undefined;
  if (!tags) {
    const { phone: _drop, ...rest } = poi;
    return rest;
  }
  const raw = tags['phone'] ?? tags['contact:phone'];
  if (typeof raw === 'string' && raw.trimStart().startsWith('+')) return poi;
  const { phone: _drop, ...rest } = poi;
  return rest;
}

/**
 * One Overpass request for one OSM id. The API (T-62) decides when to call this; the package
 * never opens a socket on import. Cache and timeout live on the returned function so each
 * `createOverpassLookup` call is independent.
 */
export function createOverpassLookup(opts: OverpassLookupOptions): OverpassLookup {
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();

  function readCache(placeId: string): LookupResult | undefined {
    const hit = cache.get(placeId);
    if (!hit) return undefined;
    if (hit.expiresAt <= now()) {
      cache.delete(placeId);
      return undefined;
    }
    return hit.result;
  }

  function writeCache(placeId: string, result: LookupResult, ttlMs: number): void {
    if (cache.size >= CACHE_CAP && !cache.has(placeId)) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(placeId, { expiresAt: now() + ttlMs, result });
  }

  return async (placeId: string): Promise<LookupResult> => {
    if (!OSM_PLACE_ID.test(placeId)) return { kind: 'not_found' };

    const cached = readCache(placeId);
    if (cached) return cached;

    const slash = placeId.indexOf('/');
    const type = placeId.slice(0, slash);
    const id = placeId.slice(slash + 1);
    const query = `[out:json][timeout:10];${type}(${id});out center tags;`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await doFetch(opts.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
          'user-agent': userAgent,
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });
    } catch {
      return { kind: 'unavailable' };
    } finally {
      clearTimeout(timer);
    }

    if (response.status !== 200) {
      return { kind: 'unavailable', status: response.status };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { kind: 'unavailable' };
    }

    if (!isRecord(body) || !Array.isArray(body['elements'])) {
      return { kind: 'unavailable' };
    }

    const elements = body['elements'] as unknown[];
    if (elements.length === 0) {
      const result: LookupResult = { kind: 'not_found' };
      writeCache(placeId, result, NOT_FOUND_TTL_MS);
      return result;
    }

    const poi = poiFromElement(elements[0]);
    if (!poi) {
      const result: LookupResult = { kind: 'not_found' };
      writeCache(placeId, result, NOT_FOUND_TTL_MS);
      return result;
    }

    const result: LookupResult = { kind: 'found', poi: applyLookupPhoneRule(poi, elements[0]) };
    writeCache(placeId, result, FOUND_TTL_MS);
    return result;
  };
}
