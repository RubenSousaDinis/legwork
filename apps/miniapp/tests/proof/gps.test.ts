import { afterEach, describe, expect, it, vi } from 'vitest';
import { GEO_ERROR, geolocationAt, geolocationFailing, stubGeolocation } from './harness';
import { GPS_TIMEOUT_MS, getPosition } from '../../lib/gps';

/**
 * The options are the contract with the phone: 10 s, high accuracy, no cached fix. A shorter
 * timeout gives up on a cold fix that was about to land; a `maximumAge` above zero would let
 * a fix from another part of town be recorded as where the worker stood.
 */

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
});

describe('lib/gps', () => {
  it('gpsTimeoutIsTenSeconds', async () => {
    const fix = stubGeolocation(geolocationAt(39.7495, -8.8078, 12));
    const result = await getPosition();

    expect(fix.options).toEqual([{ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }]);
    expect(GPS_TIMEOUT_MS).toBe(10_000);
    expect(result).toEqual({ ok: true, lat: 39.7495, lon: -8.8078, accuracy_m: 12 });

    // Every code the platform can raise maps to one this screen knows how to render.
    for (const [code, expected] of [
      [GEO_ERROR.TIMEOUT, 'timeout'],
      [GEO_ERROR.PERMISSION_DENIED, 'denied'],
      [GEO_ERROR.POSITION_UNAVAILABLE, 'unavailable'],
    ] as const) {
      stubGeolocation(geolocationFailing(code));
      expect(await getPosition()).toEqual({ ok: false, code: expected });
    }

    // A webview with no geolocation at all is `unsupported`, not a thrown error.
    stubGeolocation(null);
    expect(await getPosition()).toEqual({ ok: false, code: 'unsupported' });
  });
});
