import { describe, expect, it } from 'vitest';
import { Place } from '@legwork/shared';

const base = {
  place_id: 'node/2734018563',
  name: 'Farmácia Central',
  street_address: 'Rua Direita 12',
  locality: 'Leiria',
  country: 'PT',
};

describe('Place.country', () => {
  it('countryAcceptsMoreThanPortugal', () => {
    expect(Place.parse(base).country).toBe('PT');
    expect(Place.parse({ ...base, country: 'ES' }).country).toBe('ES');
    expect(Place.safeParse({ ...base, country: 'PRT' }).success).toBe(false);
    expect(Place.safeParse({ ...base, country: 'pt' }).success).toBe(false);
  });
});
