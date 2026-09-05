import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CompareTwoSpec, type AbuseClass } from '@legwork/shared';
import { FakeClassifier } from '../src/classifier/types.js';
import { JsonPlaceIndex } from '../src/gate/place-index.js';
import { screen } from '../src/pipeline.js';

type CorpusRow = { id: number; class: AbuseClass | null; envelope: unknown };

const read = (name: string) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const corpus: { now: string; rows: CorpusRow[] } = read('../fixtures/corpus.json');
const places = JsonPlaceIndex.fromJson(read('../fixtures/osm/leiria-min.json'));
const now = () => new Date(corpus.now);

const rowOf = (id: number) => {
  const row = corpus.rows.find((r) => r.id === id);
  if (!row) throw new Error(`row ${id} missing from the corpus`);
  return row;
};

describe('gate', () => {
  it('gateIsAuthoritative', async () => {
    // "Our classifier can only be talked into refusing, never into accepting."
    const enumerated = new FakeClassifier({ fallback: { class: null, confidence: 0.99, source: 'model' } });
    const onPath = await screen(rowOf(22).envelope, { places, classifier: enumerated, now, timeoutMs: 20 });
    expect(onPath.ok).toBe(false);
    if (onPath.ok || onPath.kind !== 'refusal') throw new Error('row 22 was not refused');
    expect(onPath.payload.class).toBe('authentication circumvention');
    expect(enumerated.calls).toHaveLength(0);

    const freeText = new FakeClassifier({ fallback: { class: null, confidence: 0.99, source: 'model' } });
    const offPath = await screen(rowOf(44).envelope, { places, classifier: freeText, now, timeoutMs: 20 });
    expect(offPath.ok).toBe(false);
    if (offPath.ok || offPath.kind !== 'refusal') throw new Error('row 44 was not refused');
    expect(offPath.payload.class).toBe('authentication circumvention');
    expect(offPath.payload.rule_id.startsWith('kw.authentication-circumvention.')).toBe(true);
    expect(freeText.calls).toHaveLength(1);
  });

  it('hashLeavesAreNotIdentifiers', async () => {
    // A hash is never an identifier, a phone still is. `sha256` is a mandatory string leaf on
    // every CompareItem, so an unbounded phone regex would refuse — and mark — roughly one
    // honest compare-two in seven, purely on the digits its hashes happened to land on.
    const hashed = structuredClone(rowOf(13).envelope) as {
      spec: { a: { sha256: string } };
    };
    hashed.spec.a.sha256 = 'c4e1912345678a1b2c3d4e5f6a7b1a1b2c3d4e5f6a7b1a1b2c3d4e5f6a7b1a1b';
    expect(CompareTwoSpec.safeParse(hashed.spec).success).toBe(true);
    const accepted = await screen(hashed, { places, classifier: new FakeClassifier(), now, timeoutMs: 20 });
    expect(accepted).toMatchObject({ ok: true });

    const spoken = structuredClone(rowOf(3).envelope) as {
      spec: { subject_detail?: string };
    };
    spoken.spec.subject_detail = 'call 912 345 678 first';
    const refused = await screen(spoken, { places, classifier: new FakeClassifier(), now, timeoutMs: 20 });
    expect(refused.ok).toBe(false);
    if (refused.ok || refused.kind !== 'refusal') throw new Error('a phone number in a note was not refused');
    expect(refused.payload.rule_id).toBe('ident.phone');
    expect(refused.payload.class).toBe('automated reconnaissance');
  });

  it('fuzzyMatchTolerantOfAccentsNotOfPeople', () => {
    // The brief's step list calls this distance 1; normalisation strips the diacritic first,
    // so `Farmacia` and `Farmácia` are the same string by the time levenshtein sees them.
    const hit = places.fuzzyMatch('node/900000001', 'Farmacia Central', 'Rua Direita 12');
    expect(hit).toEqual({ ok: true, nameDistance: 0, streetOk: true });
    expect(places.fuzzyMatch('node/900000001', 'Farmacia Centrl', 'Rua Direita 12').nameDistance).toBe(1);
    expect(places.fuzzyMatch('node/900000001', 'Farmácia Central', 'Rua do Arco 9').ok).toBe(false);

    // The residence carries no name at all, so a buyer's "Casa do João Silva" cannot match it.
    const house = places.fuzzyMatch('way/900000012', 'Casa do João Silva', 'Rua das Oliveiras 7');
    expect(house.ok).toBe(false);
    expect(house.streetOk).toBe(true);
  });

  it('placeIndexClassifiesTagsAndPhones', () => {
    expect(places.isBusiness('node/900000001')).toBe(true);
    expect(places.isResidential('node/900000001')).toBe(false);
    expect(places.isBusiness('way/900000012')).toBe(false);
    expect(places.isResidential('way/900000012')).toBe(true);
    // Porto sits in `not_indexed` and is never loaded: outside the covered region.
    expect(places.resolve('node/900000099')).toBeUndefined();
    expect(places.phoneOf('node/900000001')).toBe('+351244000000');
    // A bare 9-digit Portuguese number in `contact:phone` gets its country code back.
    expect(places.phoneOf('node/900000006')).toBe('+351244000006');
    expect(places.phoneOf('node/900000002')).toBeUndefined();
    expect(places.coordinateOf('node/900000001')).toEqual({ lat: 39.7436, lon: -8.8071 });
  });
});
