import { describe, expect, it } from 'vitest';
import { buildExtract, serializeExtract } from '../src/osm/buildExtract.js';

/**
 * One hand-written response, eight elements, covering every decision `buildExtract` makes.
 * No network and no gzip fixture: the extract is a pure function of this literal.
 */
const sample = {
  osm3s: { timestamp_osm_base: '2026-09-02T08:31:14Z' },
  elements: [
    {
      type: 'way',
      id: 104598211,
      center: { lat: 38.7101234, lon: -9.1365432 },
      tags: {
        amenity: 'restaurant',
        name: 'Tasca do Bairro',
        operator: 'João Ferreira',
        'contact:email': 'joao@example.pt',
        'addr:street': 'Rua da Boavista',
        'addr:housenumber': '44',
        'addr:city': 'Lisboa',
        'contact:phone': '244 000 006',
      },
    },
    {
      type: 'node',
      id: 2734018563,
      lat: 39.7436012,
      lon: -8.8071004,
      tags: {
        amenity: 'pharmacy',
        name: 'Farmácia Central',
        'addr:street': 'Rua Direita',
        'addr:housenumber': '12',
        'addr:city': 'Leiria',
        phone: '+351 244 000 000',
        website: 'example.pt',
      },
    },
    // Duplicate of the pharmacy: the two bounding boxes overlap nothing, but a merged
    // response can still repeat an element. The second copy is dropped.
    {
      type: 'node',
      id: 2734018563,
      lat: 39.7436012,
      lon: -8.8071004,
      tags: {
        amenity: 'pharmacy',
        name: 'Farmácia Central',
        'addr:street': 'Rua Direita',
        'addr:housenumber': '12',
        'addr:city': 'Leiria',
        phone: '+351 244 000 000',
        website: 'example.pt',
      },
    },
    {
      type: 'relation',
      id: 7788,
      center: { lat: 38.7223456, lon: -9.1398765 },
      tags: { tourism: 'museum', name: 'Museu do Bairro' },
    },
    { type: 'node', id: 555, lat: 39.7401111, lon: -8.8099999, tags: { shop: 'bakery' } },
    // No business tag and no coordinate: dropped twice over.
    { type: 'way', id: 9001, tags: { building: 'house', 'addr:street': 'Rua das Oliveiras' } },
    // A business tag but nowhere to put it: dropped.
    { type: 'node', id: 9002, tags: { shop: 'butcher', name: 'Talho sem sítio' } },
    // A coordinate but no business tag: dropped. This is the home the extract never stores.
    { type: 'node', id: 9003, lat: 39.7398, lon: -8.8102, tags: { building: 'house' } },
  ],
};

/** A fixed permutation — a shuffle the test can repeat. */
const shuffled = {
  ...sample,
  elements: [...sample.elements].reverse(),
};

describe('osm-extract', () => {
  it('extractReproducible', () => {
    const once = serializeExtract(buildExtract(sample));
    const twice = serializeExtract(buildExtract(sample));
    expect(once).toBe(twice);
    expect(serializeExtract(buildExtract(shuffled))).toBe(once);

    const extract = buildExtract(sample);
    expect(extract.generated_at).toBe(sample.osm3s.timestamp_osm_base);
    expect(extract.generated_at).not.toBe(new Date().toISOString());
    expect(extract.attribution).toBe('© OpenStreetMap contributors, ODbL');
    expect(extract.synthetic_ids).toBe(false);
    expect(extract.region).toBe('leiria+lisbon');
    expect(extract.not_indexed).toEqual([]);

    // node before way before relation, then numeric id ascending; the duplicate is gone.
    expect(extract.pois.map((p) => p.id)).toEqual([
      'node/555',
      'node/2734018563',
      'way/104598211',
      'relation/7788',
    ]);

    // A way keeps the centroid the query returned.
    const tasca = extract.pois.find((p) => p.id === 'way/104598211');
    expect(tasca?.lat).toBe(38.7101234);
    expect(tasca?.lon).toBe(-9.1365432);

    // `name` survives; `operator` and `contact:email` carry a person's name and do not.
    expect(tasca?.name).toBe('Tasca do Bairro');
    expect(tasca?.tags['operator']).toBeUndefined();
    expect(tasca?.tags['contact:email']).toBeUndefined();
    expect(Object.keys(tasca?.tags ?? {})).toEqual([
      'addr:city',
      'addr:housenumber',
      'addr:street',
      'amenity',
      'contact:phone',
      'name',
    ]);
    expect(tasca?.phone).toBe('+351244000006');

    // Everything without a coordinate or without a business tag is dropped.
    for (const dropped of ['way/9001', 'node/9002', 'node/9003']) {
      expect(extract.pois.some((p) => p.id === dropped)).toBe(false);
    }

    // Serialization is byte-stable: fixed wrapper key order, sorted tag keys, no whitespace.
    expect(once.startsWith('{"region":"leiria+lisbon","generated_at":"2026-09-02T08:31:14Z","attribution":')).toBe(true);
    expect(once).not.toContain('\n');
  });
});
