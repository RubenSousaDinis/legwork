import { normalizePhone, type Poi } from '../gate/place-index';

/**
 * The wrapper `scripts/osm-extract.ts` writes and `placeIndex.ts` reads back. Same shape as
 * T-06's `PlaceExtract`, with `synthetic_ids` and `not_indexed` always present so the file is
 * byte-stable rather than shaped by whichever keys happened to be set.
 */
export type OsmExtract = {
  region: string;
  generated_at: string;
  attribution: string;
  synthetic_ids: boolean;
  pois: Poi[];
  not_indexed: Poi[];
};

/** Leiria and Lisbon are the whole covered region; anything else is `region not covered`. */
export const REGION = 'leiria+lisbon';

/** Required wherever this data appears. Removing it is a licence failure, not a style choice. */
export const ATTRIBUTION = '© OpenStreetMap contributors, ODbL';

/** No source timestamp means the epoch — never the wall clock, or every run produces a diff. */
const EPOCH = '1970-01-01T00:00:00Z';

/**
 * The only tag keys that survive into the extract. Everything else is dropped on the way in:
 * `operator`, `contact:email` and their friends carry people's names, and this file holds
 * public facts about businesses only.
 */
export const KEEP_TAG_KEYS = [
  'shop',
  'amenity',
  'office',
  'craft',
  'healthcare',
  'tourism',
  'building',
  'landuse',
  'name',
  'brand',
  'opening_hours',
  'addr:street',
  'addr:housenumber',
  'addr:city',
  'phone',
  'contact:phone',
  'website',
] as const;

/** The six keys that make an object a business. One of them is the price of being indexed. */
const BUSINESS_TAG_KEYS = ['shop', 'amenity', 'office', 'craft', 'healthcare', 'tourism'] as const;

const TYPE_RANK: Record<string, number> = { node: 0, way: 1, relation: 2 };

type SourceResponse = { elements: unknown[]; osm3s?: { timestamp_osm_base?: string } };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v !== '' ? v : undefined;

/** Coordinates are stored at 7 decimals: about a centimetre, and stable across runs. */
const round7 = (v: number): number => Math.round(v * 1e7) / 1e7;

function coordinate(el: Record<string, unknown>): { lat: number; lon: number } | undefined {
  const center = isRecord(el['center']) ? el['center'] : undefined;
  const lat = typeof el['lat'] === 'number' ? el['lat'] : center && typeof center['lat'] === 'number' ? center['lat'] : undefined;
  const lon = typeof el['lon'] === 'number' ? el['lon'] : center && typeof center['lon'] === 'number' ? center['lon'] : undefined;
  if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  return { lat: round7(lat), lon: round7(lon) };
}

/** Keep-listed keys only, written in sorted order so the serialized object is stable. */
function keepTags(raw: unknown): Record<string, string> {
  const source = isRecord(raw) ? raw : {};
  const tags: Record<string, string> = {};
  for (const key of [...KEEP_TAG_KEYS].sort()) {
    const value = str(source[key]);
    if (value !== undefined) tags[key] = value;
  }
  return tags;
}

const hasBusinessTag = (tags: Record<string, string>): boolean =>
  BUSINESS_TAG_KEYS.some((k) => typeof tags[k] === 'string');

function toPoi(element: unknown): Poi | undefined {
  if (!isRecord(element)) return undefined;

  const type = str(element['type']);
  if (!type || !(type in TYPE_RANK)) return undefined;

  const rawId = element['id'];
  const id = typeof rawId === 'number' ? rawId : typeof rawId === 'string' ? Number(rawId) : Number.NaN;
  if (!Number.isFinite(id)) return undefined;

  const tags = keepTags(element['tags']);
  if (!hasBusinessTag(tags)) return undefined;

  const at = coordinate(element);
  if (!at) return undefined;

  const name = tags['name'];
  const street = tags['addr:street'];
  const housenumber = tags['addr:housenumber'];
  const city = tags['addr:city'];
  const rawPhone = tags['phone'] ?? tags['contact:phone'];

  return {
    id: `${type}/${id}`,
    ...(name !== undefined ? { name } : {}),
    tags,
    ...(street !== undefined || housenumber !== undefined || city !== undefined
      ? {
          addr: {
            ...(street !== undefined ? { street } : {}),
            ...(housenumber !== undefined ? { housenumber } : {}),
            ...(city !== undefined ? { city } : {}),
          },
        }
      : {}),
    ...(rawPhone !== undefined ? { phone: normalizePhone(rawPhone) } : {}),
    lat: at.lat,
    lon: at.lon,
  };
}

/** `node/12` before `way/3` before `relation/1`, then numeric id ascending. */
function compare(a: Poi, b: Poi): number {
  const [aType = '', aId = ''] = a.id.split('/');
  const [bType = '', bId = ''] = b.id.split('/');
  const rank = (TYPE_RANK[aType] ?? 99) - (TYPE_RANK[bType] ?? 99);
  return rank !== 0 ? rank : Number(aId) - Number(bId);
}

/**
 * The pure half of the extract: a query response in, a deterministic `OsmExtract` out. Same
 * input — in any element order — always produces the same bytes, so re-running the extract
 * against an unchanged region shows an empty diff.
 */
export function buildExtract(response: SourceResponse): OsmExtract {
  const seen = new Set<string>();
  const pois: Poi[] = [];

  for (const element of response.elements) {
    const poi = toPoi(element);
    if (!poi || seen.has(poi.id)) continue;
    seen.add(poi.id);
    pois.push(poi);
  }

  return {
    region: REGION,
    generated_at: response.osm3s?.timestamp_osm_base ?? EPOCH,
    attribution: ATTRIBUTION,
    synthetic_ids: false,
    pois: pois.sort(compare),
    not_indexed: [],
  };
}

function orderPoi(poi: Poi): Poi {
  const tags: Record<string, string> = {};
  for (const key of Object.keys(poi.tags).sort()) tags[key] = poi.tags[key] as string;
  return {
    id: poi.id,
    ...(poi.name !== undefined ? { name: poi.name } : {}),
    tags,
    ...(poi.addr
      ? {
          addr: {
            ...(poi.addr.street !== undefined ? { street: poi.addr.street } : {}),
            ...(poi.addr.housenumber !== undefined ? { housenumber: poi.addr.housenumber } : {}),
            ...(poi.addr.city !== undefined ? { city: poi.addr.city } : {}),
          },
        }
      : {}),
    ...(poi.phone !== undefined ? { phone: poi.phone } : {}),
    lat: poi.lat,
    lon: poi.lon,
  };
}

/** Fixed key order, sorted tags, no whitespace. The bytes are the point. */
export function serializeExtract(x: OsmExtract): string {
  return JSON.stringify({
    region: x.region,
    generated_at: x.generated_at,
    attribution: x.attribution,
    synthetic_ids: x.synthetic_ids,
    pois: x.pois.map(orderPoi),
    not_indexed: x.not_indexed.map(orderPoi),
  });
}
