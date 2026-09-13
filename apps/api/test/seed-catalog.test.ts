/**
 * Offline acceptance for the international seed catalog (T-63 §8).
 *
 * Everything here reads `catalog.json` and the shared schemas; nothing opens a socket or a
 * database. The live proof — every row screened through the gate against Overpass — is the
 * `seed:check-catalog` script, which no test imports.
 */
import { createHash } from 'node:crypto';
import ngeohash from 'ngeohash';
import { describe, expect, it } from 'vitest';
import {
  OSM_PLACE_ID,
  PRICE_FLOOR_USDC,
  SPEC_BY_TYPE,
  SPEC_MAX_CHARS,
  TASK_TYPE_BIT,
  TASK_TYPES,
} from '@legwork/shared';
import { workerBrief } from '../src/services/lifecycle';
import { CITY_BOXES, areaOf, loadCatalog, type CatalogRow } from '../src/seed/catalog';

const CATALOG_SIZE = 26;

type PlacedSpec = {
  place: { place_id: string; name: string; locality: string; country: string };
};

type CompareItem = { text: string; sha256: string };
type CompareSpec = { a: CompareItem; b: CompareItem; reference?: CompareItem };

const placed = (rows: CatalogRow[]) => rows.filter((r) => r.task_type !== 'compare-two');
const placeOf = (row: CatalogRow) => (row.spec as PlacedSpec).place;

describe('seed catalog', () => {
  it('catalogParsesAgainstTheSharedSpecSchemas', () => {
    const rows = loadCatalog();
    expect(rows).toHaveLength(CATALOG_SIZE);
    for (const row of rows) {
      expect(() => SPEC_BY_TYPE[row.task_type].parse(row.spec), row.id).not.toThrow();
    }
  });

  it('catalogSpecsFitTheWireLimit', () => {
    for (const row of loadCatalog()) {
      expect(JSON.stringify(row.spec).length, row.id).toBeLessThanOrEqual(SPEC_MAX_CHARS);
    }
  });

  it('catalogAmountsMeetTheTypeFloor', () => {
    for (const row of loadCatalog()) {
      expect(row.amount_usdc, row.id).toBeGreaterThanOrEqual(PRICE_FLOOR_USDC[row.task_type]);
      expect(row.amount_usdc, row.id).toBeLessThanOrEqual(10);
    }
  });

  it('catalogCoordinatesLieInsideTheirCityBox', () => {
    const rows = placed(loadCatalog());
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const city = row.city;
      const exact = row.exact;
      expect(city, row.id).toBeDefined();
      expect(exact, row.id).toBeDefined();
      if (city === undefined || exact === undefined) continue;

      const box = CITY_BOXES[city];
      expect(box, row.id).toBeDefined();
      if (box === undefined) continue;

      const [s, w, n, e] = box.bbox;
      expect(exact.lat, row.id).toBeGreaterThanOrEqual(s);
      expect(exact.lat, row.id).toBeLessThanOrEqual(n);
      expect(exact.lon, row.id).toBeGreaterThanOrEqual(w);
      expect(exact.lon, row.id).toBeLessThanOrEqual(e);

      const place = placeOf(row);
      expect(place.country, row.id).toBe(box.country);
      expect(place.locality, row.id).toBe(city);
    }
  });

  it('catalogCoversTenCitiesAndSevenCountries', () => {
    const rows = placed(loadCatalog());
    const cities = new Set(rows.map((r) => r.city));
    const countries = new Set(rows.map((r) => r.country));
    expect(cities.size).toBe(10);
    expect(countries.size).toBeGreaterThanOrEqual(7);
  });

  it('catalogHasEveryTaskTypeAtLeastTwice', () => {
    const counts = new Map<string, number>(TASK_TYPES.map((t) => [t, 0]));
    for (const row of loadCatalog()) counts.set(row.task_type, (counts.get(row.task_type) ?? 0) + 1);
    for (const type of TASK_TYPES) expect(counts.get(type), type).toBeGreaterThanOrEqual(2);
  });

  it('catalogPlaceIdsAreUniqueAndWellFormed', () => {
    const rows = loadCatalog();

    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

    const placeIds = placed(rows).map((r) => placeOf(r).place_id);
    expect(new Set(placeIds).size).toBe(placeIds.length);
    for (const placeId of placeIds) expect(placeId).toMatch(OSM_PLACE_ID);
  });

  it('catalogCompareTwoHashesMatchTheirText', () => {
    const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
    const rows = loadCatalog().filter((r) => r.task_type === 'compare-two');
    expect(rows.map((r) => r.id)).toEqual(['any-compare-listing-a', 'any-compare-listing-b']);

    for (const row of rows) {
      const spec = row.spec as CompareSpec;
      expect(spec.a.sha256, `${row.id} a`).toBe(sha256(spec.a.text));
      expect(spec.b.sha256, `${row.id} b`).toBe(sha256(spec.b.text));
      if (spec.reference) {
        expect(spec.reference.sha256, `${row.id} reference`).toBe(sha256(spec.reference.text));
      }
    }
  });

  it('everyCatalogRowHasAWorkerTitle', () => {
    for (const row of loadCatalog()) {
      const brief = workerBrief({ taskType: TASK_TYPE_BIT[row.task_type], specJson: row.spec });
      if (row.task_type === 'compare-two') {
        expect(brief.criterion_id, row.id).toBeTruthy();
      } else {
        expect(brief.place?.name, row.id).toBeTruthy();
      }
    }
  });

  // The board never sees `why`, and the catalog never carries a state: a seeded row is `open`
  // and nothing else, decided at insert time and not by the data file.
  it('carries no state and renders no why', () => {
    for (const row of loadCatalog()) {
      expect(JSON.stringify(row.spec)).not.toContain('"state"');
      expect(JSON.stringify(row.spec)).not.toContain(row.why);
    }
  });
});

describe('areaOf', () => {
  it('encodes a placed row to geohash-5 and a compare-two row to any', () => {
    const rows = loadCatalog();
    const withPlace = placed(rows)[0];
    const compare = rows.find((r) => r.task_type === 'compare-two');
    expect(withPlace?.exact).toBeDefined();
    expect(compare).toBeDefined();
    if (!withPlace?.exact || !compare) return;

    expect(areaOf(withPlace)).toBe(ngeohash.encode(withPlace.exact.lat, withPlace.exact.lon, 5));
    expect(areaOf(withPlace)).toHaveLength(5);
    expect(areaOf(compare)).toBe('any');
  });
});
