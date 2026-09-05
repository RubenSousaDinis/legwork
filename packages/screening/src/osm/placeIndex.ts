import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { JsonPlaceIndex, type PlaceIndex, type Poi } from '../gate/place-index';
import type { OsmExtract } from './buildExtract';

/** The extract that ships with the package. `OSM_EXTRACT_PATH` overrides it. */
const PACKAGED_EXTRACT = fileURLToPath(new URL('../../fixtures/osm/leiria-lisbon.json.gz', import.meta.url));

/** The command that writes the file, quoted back at the operator when it is missing. */
const EXTRACT_COMMAND = 'pnpm osm:extract';

/** Gunzip and parse, synchronously: this runs once at boot and never on a request path. */
export function loadExtract(path: string): OsmExtract {
  if (!existsSync(path)) {
    throw new Error(`OSM extract not found at ${path} — run \`${EXTRACT_COMMAND}\` to write it`);
  }
  return JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as OsmExtract;
}

/**
 * `PlaceIndex` over the gzipped extract. Every matching rule — normalisation, Levenshtein,
 * the business and residential tag sets, phone normalisation — belongs to T-06's
 * `JsonPlaceIndex` and is delegated to it. A second copy here would drift from the corpus.
 */
export class OsmPlaceIndex implements PlaceIndex {
  private readonly inner: JsonPlaceIndex;
  readonly region: string;
  readonly attribution: string;
  readonly generatedAt: string;

  private constructor(extract: OsmExtract) {
    // `fromJson` reads `pois` only: `not_indexed` is in the file and never in the index.
    this.inner = JsonPlaceIndex.fromJson(extract);
    this.region = extract.region;
    this.attribution = extract.attribution;
    this.generatedAt = extract.generated_at;
  }

  static fromGzip(path: string): OsmPlaceIndex {
    return new OsmPlaceIndex(loadExtract(path));
  }

  static fromExtract(x: OsmExtract): OsmPlaceIndex {
    return new OsmPlaceIndex(x);
  }

  resolve(id: string): Poi | undefined {
    return this.inner.resolve(id);
  }

  isBusiness(id: string): boolean {
    return this.inner.isBusiness(id);
  }

  isResidential(id: string): boolean {
    return this.inner.isResidential(id);
  }

  fuzzyMatch(id: string, name: string, street: string): { ok: boolean; nameDistance: number; streetOk: boolean } {
    return this.inner.fuzzyMatch(id, name, street);
  }

  phoneOf(id: string): string | undefined {
    return this.inner.phoneOf(id);
  }

  coordinateOf(id: string): { lat: number; lon: number } | undefined {
    return this.inner.coordinateOf(id);
  }
}

let cached: PlaceIndex | undefined;

/**
 * The boot-time singleton. Loaded once on the first call and kept; it never reaches the
 * network, and a missing file is a wiring failure at boot rather than a 500 on a request.
 */
export function getPlaceIndex(): PlaceIndex {
  if (!cached) cached = OsmPlaceIndex.fromGzip(process.env['OSM_EXTRACT_PATH'] ?? PACKAGED_EXTRACT);
  return cached;
}

/**
 * The operator's one-command check for the demo shop's real id on Day 2. The id in
 * `demo-data.json` is a placeholder until then, so an unresolvable id is an answer here —
 * never a throw, and never a startup crash.
 */
export function checkDemoPlace(
  index: PlaceIndex,
  placeId: string,
): { ok: boolean; reason?: 'region not covered' | 'not a business' | 'no phone' } {
  if (!index.resolve(placeId)) return { ok: false, reason: 'region not covered' };
  if (!index.isBusiness(placeId)) return { ok: false, reason: 'not a business' };
  if (!index.phoneOf(placeId)) return { ok: false, reason: 'no phone' };
  return { ok: true };
}
