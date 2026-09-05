import { readFileSync } from 'node:fs';
import { levenshtein } from './levenshtein';

/** One point of interest out of the cached OpenStreetMap extract. */
export type Poi = {
  id: string;
  name?: string;
  tags: Record<string, string>;
  addr?: { street?: string; housenumber?: string; city?: string };
  phone?: string;
  lat: number;
  lon: number;
};

/**
 * The place side of the gate. T-22 implements this over the real gzipped extract; the JSON
 * implementation below runs the corpus. There is no live geocoder on any path.
 */
export interface PlaceIndex {
  /** `undefined` means the id is outside the covered region, not that it does not exist. */
  resolve(id: string): Poi | undefined;
  isBusiness(id: string): boolean;
  isResidential(id: string): boolean;
  fuzzyMatch(id: string, name: string, street: string): { ok: boolean; nameDistance: number; streetOk: boolean };
  /** E.164, from the `phone` field or the `phone` / `contact:phone` tag. */
  phoneOf(id: string): string | undefined;
  /** For the 150 m geofence (T-17). This package never serializes a coordinate. */
  coordinateOf(id: string): { lat: number; lon: number } | undefined;
}

/** The shape of `fixtures/osm/leiria-min.json`, and of what T-22's extractor writes. */
export type PlaceExtract = {
  region: string;
  generated_at: string;
  attribution: string;
  synthetic_ids?: boolean;
  pois: Poi[];
  /** Present in the file, deliberately never loaded: these ids must resolve to `undefined`. */
  not_indexed?: Poi[];
};

const BUSINESS_TAG_KEYS = ['shop', 'amenity', 'office', 'craft', 'healthcare', 'tourism'] as const;
const RESIDENTIAL_BUILDINGS = ['house', 'residential', 'apartments'] as const;

/** NFD, drop combining marks, lowercase, collapse whitespace, drop a trailing house number. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[\s,]+/gu, ' ')
    .trim()
    .replace(/\s+n?\.?º?\s*\d+[a-z]?$/u, '')
    .trim();
}

/** Strip separators; a bare 9-digit Portuguese number gets its country code back. */
export function normalizePhone(raw: string): string {
  const compact = raw.replace(/[\s.()-]/gu, '');
  if (/^\d{9}$/u.test(compact)) return `+351${compact}`;
  if (/^351\d{9}$/u.test(compact)) return `+${compact}`;
  return compact;
}

export class JsonPlaceIndex implements PlaceIndex {
  private readonly byId: Map<string, Poi>;
  readonly region: string;
  readonly attribution: string;

  private constructor(extract: PlaceExtract) {
    this.region = extract.region;
    this.attribution = extract.attribution;
    this.byId = new Map(extract.pois.map((p) => [p.id, p]));
  }

  static fromJson(obj: unknown): JsonPlaceIndex {
    return new JsonPlaceIndex(obj as PlaceExtract);
  }

  static fromFile(path: string): JsonPlaceIndex {
    return JsonPlaceIndex.fromJson(JSON.parse(readFileSync(path, 'utf8')));
  }

  resolve(id: string): Poi | undefined {
    return this.byId.get(id);
  }

  isBusiness(id: string): boolean {
    const poi = this.byId.get(id);
    if (!poi) return false;
    return BUSINESS_TAG_KEYS.some((k) => typeof poi.tags[k] === 'string' && poi.tags[k] !== '');
  }

  isResidential(id: string): boolean {
    const poi = this.byId.get(id);
    if (!poi) return false;
    if (this.isBusiness(id)) return false;
    const building = poi.tags['building'];
    if (building && (RESIDENTIAL_BUILDINGS as readonly string[]).includes(building)) return true;
    return poi.tags['landuse'] === 'residential';
  }

  fuzzyMatch(id: string, name: string, street: string): { ok: boolean; nameDistance: number; streetOk: boolean } {
    const poi = this.byId.get(id);
    if (!poi) return { ok: false, nameDistance: Number.POSITIVE_INFINITY, streetOk: false };
    const nameDistance = levenshtein(normalizeForMatch(name), normalizeForMatch(poi.name ?? ''));
    const poiStreet = poi.addr?.street;
    const streetOk = !poiStreet ? true : normalizeForMatch(street).startsWith(normalizeForMatch(poiStreet));
    return { ok: nameDistance <= 3 && streetOk, nameDistance, streetOk };
  }

  phoneOf(id: string): string | undefined {
    const poi = this.byId.get(id);
    if (!poi) return undefined;
    const raw = poi.phone ?? poi.tags['phone'] ?? poi.tags['contact:phone'];
    return raw ? normalizePhone(raw) : undefined;
  }

  coordinateOf(id: string): { lat: number; lon: number } | undefined {
    const poi = this.byId.get(id);
    return poi ? { lat: poi.lat, lon: poi.lon } : undefined;
  }
}
