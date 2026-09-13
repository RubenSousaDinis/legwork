/**
 * The international seed catalog: 26 real errands across ten cities.
 *
 * `catalog.json` is the source of truth; this module validates it against the shared
 * envelopes and never invents a place_id.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import ngeohash from 'ngeohash';
import {
  OSM_PLACE_ID,
  PRICE_FLOOR_USDC,
  SPEC_BY_TYPE,
  TASK_TYPES,
  type TaskType,
} from '@legwork/shared';

/** South, West, North, East — the same order Overpass bbox queries use. */
export const CITY_BOXES: Record<string, { country: string; bbox: [number, number, number, number] }> = {
  Leiria: { country: 'PT', bbox: [39.68, -8.9, 39.82, -8.7] },
  Lisbon: { country: 'PT', bbox: [38.68, -9.25, 38.83, -9.08] },
  Porto: { country: 'PT', bbox: [41.12, -8.7, 41.2, -8.55] },
  Madrid: { country: 'ES', bbox: [40.35, -3.8, 40.5, -3.6] },
  Berlin: { country: 'DE', bbox: [52.4, 13.2, 52.6, 13.6] },
  London: { country: 'GB', bbox: [51.45, -0.25, 51.58, 0.0] },
  'New York': { country: 'US', bbox: [40.68, -74.05, 40.83, -73.9] },
  'San Francisco': { country: 'US', bbox: [37.7, -122.52, 37.83, -122.35] },
  Singapore: { country: 'SG', bbox: [1.22, 103.6, 1.47, 104.05] },
  Tokyo: { country: 'JP', bbox: [35.55, 139.55, 35.8, 139.9] },
};

const Exact = z.object({
  lat: z.number(),
  lon: z.number(),
});

const CatalogRowBase = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case id'),
  city: z.string().optional(),
  country: z.string().optional(),
  task_type: z.enum(TASK_TYPES),
  amount_usdc: z.number(),
  posted_ago_s: z.number().int().min(600).max(72_000),
  exact: Exact.optional(),
  why: z.string().max(140),
  spec: z.unknown(),
});

export type CatalogRow = z.infer<typeof CatalogRowBase> & {
  task_type: TaskType;
  spec: z.infer<(typeof SPEC_BY_TYPE)[TaskType]>;
};

function inBox(lat: number, lon: number, bbox: [number, number, number, number]): boolean {
  const [s, w, n, e] = bbox;
  return lat >= s && lat <= n && lon >= w && lon <= e;
}

export const CatalogRow = CatalogRowBase.superRefine((row, ctx) => {
  const floor = PRICE_FLOOR_USDC[row.task_type];
  if (row.amount_usdc < floor || row.amount_usdc > 10) {
    ctx.addIssue({
      code: 'custom',
      path: ['amount_usdc'],
      message: `${row.id}: amount_usdc must be in [${floor}, 10]`,
    });
  }

  const schema = SPEC_BY_TYPE[row.task_type];
  const parsed = schema.safeParse(row.spec);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    ctx.addIssue({
      code: 'custom',
      path: ['spec', ...(issue?.path ?? [])],
      message: `${row.id}: ${issue?.message ?? 'invalid spec'}`,
    });
    return;
  }

  if (row.task_type === 'compare-two') {
    if (row.city !== undefined || row.country !== undefined || row.exact !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: `${row.id}: compare-two rows have no city, country or exact`,
      });
    }
    return;
  }

  if (!row.city || !(row.city in CITY_BOXES)) {
    ctx.addIssue({
      code: 'custom',
      path: ['city'],
      message: `${row.id}: city must be a CITY_BOXES key`,
    });
    return;
  }
  const box = CITY_BOXES[row.city]!;
  if (row.country !== box.country) {
    ctx.addIssue({
      code: 'custom',
      path: ['country'],
      message: `${row.id}: country must be ${box.country}`,
    });
  }
  if (!row.exact) {
    ctx.addIssue({ code: 'custom', path: ['exact'], message: `${row.id}: exact is required` });
    return;
  }
  if (!inBox(row.exact.lat, row.exact.lon, box.bbox)) {
    ctx.addIssue({
      code: 'custom',
      path: ['exact'],
      message: `${row.id}: exact is outside ${row.city} bbox`,
    });
  }

  const place = (parsed.data as { place?: { place_id?: string; locality?: string; country?: string } })
    .place;
  if (place) {
    if (!place.place_id || !OSM_PLACE_ID.test(place.place_id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['spec', 'place', 'place_id'],
        message: `${row.id}: place_id must match OSM_PLACE_ID`,
      });
    }
    if (place.locality !== row.city) {
      ctx.addIssue({
        code: 'custom',
        path: ['spec', 'place', 'locality'],
        message: `${row.id}: place.locality must equal city`,
      });
    }
    if (place.country !== box.country) {
      ctx.addIssue({
        code: 'custom',
        path: ['spec', 'place', 'country'],
        message: `${row.id}: place.country must equal city country`,
      });
    }
  }
});

const CATALOG_PATH = fileURLToPath(new URL('./catalog.json', import.meta.url));

let cached: CatalogRow[] | undefined;

/** Parses `catalog.json` once. Throws on the first invalid row with its `id` in the message. */
export function loadCatalog(): CatalogRow[] {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as unknown;
  if (!Array.isArray(raw)) throw new Error('catalog.json must be an array');
  const rows: CatalogRow[] = [];
  for (const item of raw) {
    const id = item && typeof item === 'object' && 'id' in item ? String((item as { id: unknown }).id) : '(missing id)';
    const parsed = CatalogRow.safeParse(item);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'invalid row';
      throw new Error(`catalog row ${id}: ${msg}`);
    }
    rows.push(parsed.data as CatalogRow);
  }
  cached = rows;
  return rows;
}

/** Geohash-5 of the place, or `'any'` for compare-two. */
export function areaOf(row: CatalogRow): string {
  if (!row.exact) return 'any';
  return ngeohash.encode(row.exact.lat, row.exact.lon, 5);
}

/** Vitest: drop the cached parse so a mutated fixture is re-read. */
export function resetCatalogForTests(): void {
  cached = undefined;
}
