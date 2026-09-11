import { describe, expect, it } from 'vitest';
import { createOverpassLookup } from '../src/osm/overpassLookup.js';
const ENDPOINT = 'https://overpass.test/api/interpreter';

type FetchCall = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function recordingFetch(handler: (call: FetchCall, n: number) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const call = { url, init };
    calls.push(call);
    return handler(call, calls.length);
  };
  return { fetchFn, calls };
}

describe('overpass-lookup', () => {
  it('lookupResolvesNodeById', async () => {
    const { fetchFn } = recordingFetch(() =>
      jsonResponse({
        elements: [
          {
            type: 'node',
            id: 536546148,
            lat: 40.2104,
            lon: -8.4192,
            tags: {
              amenity: 'pharmacy',
              name: 'Farmácia Adriana',
              'addr:street': 'Rua da Sofia',
            },
          },
        ],
      }),
    );
    const lookup = createOverpassLookup({ endpoint: ENDPOINT, fetch: fetchFn });
    const result = await lookup('node/536546148');
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') return;
    expect(result.poi.id).toBe('node/536546148');
    expect(result.poi.name).toBe('Farmácia Adriana');
    expect(result.poi.lat).toBe(40.2104);
    expect(result.poi.lon).toBe(-8.4192);
  });

  it('lookupResolvesWayByCenter', async () => {
    const { fetchFn } = recordingFetch(() =>
      jsonResponse({
        elements: [
          {
            type: 'way',
            id: 7,
            center: { lat: 38.7101234, lon: -9.1365432 },
            tags: { shop: 'bakery', name: 'Pão Quente' },
          },
        ],
      }),
    );
    const lookup = createOverpassLookup({ endpoint: ENDPOINT, fetch: fetchFn });
    const result = await lookup('way/7');
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') return;
    expect(result.poi.id).toBe('way/7');
    expect(result.poi.lat).toBe(38.7101234);
    expect(result.poi.lon).toBe(-9.1365432);
  });

  it('lookupSendsExactlyOneRequestWithTheIdQuery', async () => {
    const { fetchFn, calls } = recordingFetch(() =>
      jsonResponse({
        elements: [{ type: 'node', id: 536546148, lat: 40.21, lon: -8.42, tags: { shop: 'yes' } }],
      }),
    );
    const lookup = createOverpassLookup({ endpoint: ENDPOINT, fetch: fetchFn });
    await lookup('node/536546148');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(ENDPOINT);
    expect(calls[0]!.init?.method).toBe('POST');
    const headers = new Headers(calls[0]!.init?.headers);
    expect(headers.get('user-agent')).toMatch(/legwork-place-lookup/);
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    const body = String(calls[0]!.init?.body);
    const params = new URLSearchParams(body);
    expect(params.get('data')).toBe('[out:json][timeout:10];node(536546148);out center tags;');
  });

  it('lookupIsNotFoundOnEmptyElements', async () => {
    const { fetchFn } = recordingFetch(() => jsonResponse({ elements: [] }));
    const lookup = createOverpassLookup({ endpoint: ENDPOINT, fetch: fetchFn });
    expect(await lookup('node/1')).toEqual({ kind: 'not_found' });
  });

  it('lookupIsNotFoundForAnElementWithoutABusinessTag', async () => {
    const { fetchFn } = recordingFetch(() =>
      jsonResponse({
        elements: [{ type: 'node', id: 9, lat: 39.74, lon: -8.8, tags: { building: 'house' } }],
      }),
    );
    const lookup = createOverpassLookup({ endpoint: ENDPOINT, fetch: fetchFn });
    expect(await lookup('node/9')).toEqual({ kind: 'not_found' });
  });

  it('lookupIsNotFoundForABadIdWithoutARequest', async () => {
    const { fetchFn, calls } = recordingFetch(() => jsonResponse({ elements: [] }));
    const lookup = createOverpassLookup({ endpoint: ENDPOINT, fetch: fetchFn });
    expect(await lookup('foo/1')).toEqual({ kind: 'not_found' });
    expect(await lookup('node/abc')).toEqual({ kind: 'not_found' });
    expect(calls).toHaveLength(0);
  });

  it('lookupIsUnavailableOn429', async () => {
    const { fetchFn } = recordingFetch(() => jsonResponse({ error: 'rate' }, 429));
    const lookup = createOverpassLookup({ endpoint: ENDPOINT, fetch: fetchFn });
    expect(await lookup('node/1')).toEqual({ kind: 'unavailable', status: 429 });
  });

  it('lookupIsUnavailableOnTimeout', async () => {
    const fetchFn: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          if (signal.aborted) {
            reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
            return;
          }
          signal.addEventListener('abort', () => {
            reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
          });
        }
      });
    const lookup = createOverpassLookup({ endpoint: ENDPOINT, fetch: fetchFn, timeoutMs: 20 });
    expect(await lookup('node/1')).toEqual({ kind: 'unavailable' });
  });

  it('lookupIsUnavailableOnNetworkError', async () => {
    const fetchFn: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const lookup = createOverpassLookup({ endpoint: ENDPOINT, fetch: fetchFn });
    expect(await lookup('node/1')).toEqual({ kind: 'unavailable' });
  });

  it('lookupDropsBareLocalPhone', async () => {
    const { fetchFn } = recordingFetch(() =>
      jsonResponse({
        elements: [
          {
            type: 'node',
            id: 1,
            lat: 39.74,
            lon: -8.8,
            tags: { shop: 'x', phone: '244 000 000' },
          },
        ],
      }),
    );
    const lookup = createOverpassLookup({ endpoint: ENDPOINT, fetch: fetchFn });
    const result = await lookup('node/1');
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') return;
    expect(result.poi.phone).toBeUndefined();
  });

  it('lookupKeepsInternationalPhone', async () => {
    const { fetchFn } = recordingFetch(() =>
      jsonResponse({
        elements: [
          {
            type: 'node',
            id: 2,
            lat: 51.5,
            lon: -0.12,
            tags: { shop: 'x', phone: '+44 20 7946 0000' },
          },
        ],
      }),
    );
    const lookup = createOverpassLookup({ endpoint: ENDPOINT, fetch: fetchFn });
    const result = await lookup('node/2');
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') return;
    expect(result.poi.phone).toBe('+442079460000');
  });

  it('lookupCachesAFoundId', async () => {
    const { fetchFn, calls } = recordingFetch(() =>
      jsonResponse({
        elements: [{ type: 'node', id: 5, lat: 39.74, lon: -8.8, tags: { shop: 'yes' } }],
      }),
    );
    const lookup = createOverpassLookup({ endpoint: ENDPOINT, fetch: fetchFn });
    await lookup('node/5');
    await lookup('node/5');
    expect(calls).toHaveLength(1);
  });

  it('lookupDoesNotCacheUnavailable', async () => {
    const { fetchFn, calls } = recordingFetch((_call, n) => {
      if (n === 1) return jsonResponse({}, 503);
      return jsonResponse({
        elements: [{ type: 'node', id: 6, lat: 39.74, lon: -8.8, tags: { shop: 'yes' } }],
      });
    });
    const lookup = createOverpassLookup({ endpoint: ENDPOINT, fetch: fetchFn });
    expect(await lookup('node/6')).toEqual({ kind: 'unavailable', status: 503 });
    const second = await lookup('node/6');
    expect(second.kind).toBe('found');
    expect(calls).toHaveLength(2);
  });

  it('lookupExpiresNotFoundAfterTenMinutes', async () => {
    let t = 0;
    const { fetchFn, calls } = recordingFetch(() => jsonResponse({ elements: [] }));
    const lookup = createOverpassLookup({
      endpoint: ENDPOINT,
      fetch: fetchFn,
      now: () => t,
    });
    expect(await lookup('node/8')).toEqual({ kind: 'not_found' });
    expect(calls).toHaveLength(1);
    t = 601_000;
    expect(await lookup('node/8')).toEqual({ kind: 'not_found' });
    expect(calls).toHaveLength(2);
  });
});
