import { describe, expect, it } from 'vitest';
import { JsonPlaceIndex, type Poi } from '../src/gate/place-index.js';
import { LayeredPlaceIndex } from '../src/osm/layeredIndex.js';

const basePoi: Poi = {
  id: 'node/1',
  name: 'Base Shop',
  tags: { shop: 'convenience', name: 'Base Shop' },
  addr: { street: 'Rua Base' },
  lat: 39.74,
  lon: -8.8,
};

const extraNode1: Poi = {
  id: 'node/1',
  name: 'Extra Shop',
  tags: { shop: 'bakery', name: 'Extra Shop' },
  addr: { street: 'Rua Extra' },
  lat: 40.2,
  lon: -8.4,
};

const extraNode2: Poi = {
  id: 'node/2',
  name: 'Farmácia Adriana',
  tags: { amenity: 'pharmacy', name: 'Farmácia Adriana', 'addr:street': 'Rua X' },
  addr: { street: 'Rua X' },
  lat: 40.2104,
  lon: -8.4192,
};

const residentialExtra: Poi = {
  id: 'node/3',
  tags: { building: 'house' },
  lat: 39.74,
  lon: -8.8,
};

const base = JsonPlaceIndex.fromJson({
  region: 'test-base',
  generated_at: '1970-01-01T00:00:00Z',
  attribution: '© OpenStreetMap contributors, ODbL',
  pois: [basePoi],
});

describe('layered-index', () => {
  it('layeredIndexPrefersBase', () => {
    const index = new LayeredPlaceIndex(base, [extraNode1]);
    expect(index.resolve('node/1')).toEqual(basePoi);
    expect(index.resolve('node/1')?.name).toBe('Base Shop');
  });

  it('layeredIndexFillsFromExtra', () => {
    const index = new LayeredPlaceIndex(base, [extraNode2]);
    expect(index.resolve('node/2')).toEqual(extraNode2);
    expect(index.isBusiness('node/2')).toBe(true);
    expect(index.coordinateOf('node/2')).toEqual({ lat: 40.2104, lon: -8.4192 });
  });

  it('layeredIndexFuzzyMatchesExtraPoi', () => {
    const index = new LayeredPlaceIndex(base, [extraNode2]);
    const match = index.fuzzyMatch('node/2', 'Farmacia Adriana', 'Rua X 1');
    expect(match.ok).toBe(true);
    expect(match.streetOk).toBe(true);
  });

  it('layeredIndexResidentialExtraIsResidential', () => {
    const index = new LayeredPlaceIndex(base, [residentialExtra]);
    expect(index.isResidential('node/3')).toBe(true);
    expect(index.isBusiness('node/3')).toBe(false);
  });

  it('layeredIndexEmptyExtraIsTheBase', () => {
    const index = new LayeredPlaceIndex(base, []);
    expect(index.resolve('node/1')).toEqual(base.resolve('node/1'));
    expect(index.resolve('node/999')).toBeUndefined();
    expect(base.resolve('node/999')).toBeUndefined();
    expect(index.isBusiness('node/1')).toBe(base.isBusiness('node/1'));
    expect(index.phoneOf('node/1')).toBe(base.phoneOf('node/1'));
  });
});
