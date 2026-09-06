import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AbuseClass } from '@legwork/shared';
import { FakeClassifier } from '../src/classifier/types.js';
import { screen } from '../src/pipeline.js';
import type { OsmExtract } from '../src/osm/buildExtract.js';
import { OsmPlaceIndex, checkDemoPlace } from '../src/osm/placeIndex.js';

type CorpusRow = { id: number; class: AbuseClass | null; envelope: unknown };

const read = (name: string) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const corpus: { now: string; rows: CorpusRow[] } = read('../fixtures/corpus.json');

/**
 * T-06's twelve-POI fixture, read through the extract implementation. Same file the corpus
 * runs against: the gzipped extract is the operator's, not this suite's, and no test here
 * opens a socket or gunzips anything.
 */
const places = OsmPlaceIndex.fromExtract(read('../fixtures/osm/leiria-min.json') as OsmExtract);
const now = () => new Date(corpus.now);

const rowOf = (id: number) => {
  const row = corpus.rows.find((r) => r.id === id);
  if (!row) throw new Error(`row ${id} missing from the corpus`);
  return row;
};

const screenRow = (id: number) =>
  screen(rowOf(id).envelope, { places, classifier: new FakeClassifier(), now, timeoutMs: 20 });

/** The Leiria bounding box `scripts/osm-extract.ts` queries: S, W, N, E. */
const LEIRIA_BBOX = { s: 39.68, w: -8.9, n: 39.82, e: -8.7 };

describe('osm-placeindex', () => {
  it('placeIndexResolvesDemoShop', () => {
    const id = 'node/900000001';
    expect(places.resolve(id)).toBeDefined();
    expect(places.isBusiness(id)).toBe(true);
    expect(places.isResidential(id)).toBe(false);
    expect(places.phoneOf(id)).toBe('+351244000000');

    const at = places.coordinateOf(id);
    expect(at).toBeDefined();
    expect(at!.lat).toBeGreaterThanOrEqual(LEIRIA_BBOX.s);
    expect(at!.lat).toBeLessThanOrEqual(LEIRIA_BBOX.n);
    expect(at!.lon).toBeGreaterThanOrEqual(LEIRIA_BBOX.w);
    expect(at!.lon).toBeLessThanOrEqual(LEIRIA_BBOX.e);

    // Neither the missing accent nor the trailing house number may break the match.
    // The brief's §8 predicts nameDistance 1; T-06's frozen normaliser strips diacritics
    // before the distance is taken, so "Farmacia Central" and "Farmácia Central" are the
    // same string and the distance is 0. Delegating to `JsonPlaceIndex` is the rule that
    // wins here — loosening or copying the matcher to reach 1 is exactly what §2.3 forbids.
    const match = places.fuzzyMatch(id, 'Farmacia Central', 'Rua Direita 12');
    expect(match.ok).toBe(true);
    expect(match.streetOk).toBe(true);
    expect(match.nameDistance).toBe(0);
    expect(match.nameDistance).toBeLessThanOrEqual(3);

    // The demo id is a placeholder until Day 2: unresolvable is an answer, never a throw.
    expect(() => checkDemoPlace(places, 'node/000000000')).not.toThrow();
    expect(checkDemoPlace(places, 'node/000000000')).toEqual({ ok: false, reason: 'region not covered' });
    expect(checkDemoPlace(places, id)).toEqual({ ok: true });
  });

  it('residentialRefusedAsReconnaissance', async () => {
    const id = 'way/900000012';
    expect(places.isResidential(id)).toBe(true);
    expect(places.isBusiness(id)).toBe(false);

    const row18 = await screenRow(18);
    expect(row18.ok).toBe(false);
    if (row18.ok || row18.kind !== 'refusal') throw new Error('row 18 was not refused');
    expect(row18.payload.class).toBe('automated reconnaissance');
    expect(row18.payload.rule_id).toBe('place.residential');

    // A person's name in a place field is a refusal, not a fuzzy match.
    const row19 = await screenRow(19);
    expect(row19.ok).toBe(false);
    if (row19.ok || row19.kind !== 'refusal') throw new Error('row 19 was not refused');
    expect(row19.payload.class).toBe('automated reconnaissance');
  });

  it('regionNotCoveredRow17', async () => {
    const porto = 'node/900000099';
    expect(places.resolve(porto)).toBeUndefined();
    expect(places.coordinateOf(porto)).toBeUndefined();

    // `not_indexed` is in the file and never in the index.
    const fixture = read('../fixtures/osm/leiria-min.json') as OsmExtract;
    expect(fixture.not_indexed.map((p) => p.id)).toContain(porto);
    for (const poi of fixture.not_indexed) expect(places.resolve(poi.id)).toBeUndefined();

    const row17 = await screenRow(17);
    expect(row17.ok).toBe(false);
    if (row17.ok || row17.kind !== 'invalid_request') throw new Error('row 17 was not a 4xx');
    expect(row17.field).toBe('spec.place.place_id');
    expect(row17.reason).toBe('region not covered');
    // A coverage failure never marks: there is no class on this outcome at all.
    expect(row17).not.toHaveProperty('payload');
    expect((row17 as Record<string, unknown>)['class']).toBeUndefined();
  });

  it('phoneMismatchRow31', async () => {
    const row31 = await screenRow(31);
    expect(row31.ok).toBe(false);
    if (row31.ok || row31.kind !== 'invalid_request') throw new Error('row 31 was not a 4xx');
    expect(row31.field).toBe('spec.phone');
    expect(row31.reason).toBe('phone does not match the place');

    // The market has no phone tag at all.
    expect(places.phoneOf('node/900000002')).toBeUndefined();

    // Three spellings of one number, one E.164 string.
    const spellings: OsmExtract = {
      region: 'leiria+lisbon',
      generated_at: '1970-01-01T00:00:00Z',
      attribution: '© OpenStreetMap contributors, ODbL',
      synthetic_ids: false,
      not_indexed: [],
      pois: [
        { id: 'node/1', tags: { amenity: 'pharmacy' }, phone: '+351 244 000 000', lat: 39.74, lon: -8.8 },
        { id: 'node/2', tags: { amenity: 'pharmacy', phone: '244000000' }, lat: 39.74, lon: -8.8 },
        { id: 'node/3', tags: { amenity: 'pharmacy', 'contact:phone': '244 000 000' }, lat: 39.74, lon: -8.8 },
      ],
    };
    const index = OsmPlaceIndex.fromExtract(spellings);
    for (const id of ['node/1', 'node/2', 'node/3']) {
      expect(index.phoneOf(id)).toBe('+351244000000');
    }
  });
});
