import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { geocodeAddress } from '../../lib/geocode';

describe('geocodeAddress', () => {
  it('returns the first nominatim hit', async () => {
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', () =>
        HttpResponse.json([{ lat: '38.7223', lon: '-9.1393' }]),
      ),
    );
    await expect(geocodeAddress('Lisboa')).resolves.toEqual({ lat: 38.7223, lon: -9.1393 });
  });

  it('returns null for a short query or an empty answer', async () => {
    expect(await geocodeAddress('ab')).toBeNull();
    expect(await geocodeAddress('Lisboa')).toBeNull();
  });
});
