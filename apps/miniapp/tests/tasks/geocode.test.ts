import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { geocodeAddress } from '../../lib/geocode';

const LISBON_BOX = ['38.6913994', '38.7967584', '-9.2298356', '-9.0863328'];

describe('geocodeAddress', () => {
  it('returns the first nominatim hit', async () => {
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', () =>
        HttpResponse.json([
          {
            lat: '38.7223',
            lon: '-9.1393',
            boundingbox: LISBON_BOX,
            class: 'boundary',
            type: 'administrative',
          },
        ]),
      ),
    );
    await expect(geocodeAddress('Lisboa')).resolves.toEqual({
      lat: 38.7223,
      lon: -9.1393,
      south: 38.6913994,
      north: 38.7967584,
      west: -9.2298356,
      east: -9.0863328,
    });
  });

  it('prefers a city over a street of the same name', async () => {
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', () =>
        HttpResponse.json([
          {
            lat: '38.71',
            lon: '-9.13',
            boundingbox: ['38.709', '38.711', '-9.131', '-9.129'],
            class: 'highway',
            type: 'residential',
          },
          {
            lat: '38.7223',
            lon: '-9.1393',
            boundingbox: LISBON_BOX,
            class: 'boundary',
            type: 'administrative',
          },
        ]),
      ),
    );
    const hit = await geocodeAddress('Lisboa');
    expect(hit?.south).toBe(38.6913994);
    expect(hit?.north).toBe(38.7967584);
  });

  it('returns null for a short query or an empty answer', async () => {
    expect(await geocodeAddress('ab')).toBeNull();
    expect(await geocodeAddress('Lisboa')).toBeNull();
  });
});
