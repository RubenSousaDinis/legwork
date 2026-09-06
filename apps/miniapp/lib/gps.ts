/**
 * One fix, or an honest reason there is none.
 *
 * World App exposes no location permission of its own, so `getCurrentPosition` inside the
 * webview may hang, be denied, or answer with nothing. That is not a failure path bolted on
 * afterwards — it is the pre-decided second path (02-architecture): photo + server timestamp
 * + the worker's tapped confirmation, disclosed on the receipt. So every outcome here is a
 * value the UI can render, never a thrown error and never a silent zero: a coordinate this
 * module could not obtain is `ok: false`, and nothing downstream may invent one.
 */

/** 10 s, from the brief. Long enough for a cold fix on a phone, short enough to stand still for. */
export const GPS_TIMEOUT_MS = 10_000;

/**
 * `enableHighAccuracy` because a street-level geofence is the point; `maximumAge: 0` because a
 * cached fix from another part of town is worse than no fix at all — it would be recorded as
 * where the worker stood.
 */
export const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: GPS_TIMEOUT_MS,
  maximumAge: 0,
};

/** The ceiling `Gps.accuracy_m` allows in `packages/shared`; what an unstated accuracy is worth. */
export const UNKNOWN_ACCURACY_M = 10_000;

export type GpsFailureCode = 'timeout' | 'denied' | 'unavailable' | 'unsupported';

export type GpsResult =
  | { ok: true; lat: number; lon: number; accuracy_m: number }
  | { ok: false; code: GpsFailureCode };

/** `GeolocationPositionError` numbers, which some webviews send without the class constants. */
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

/** Anything the platform does not name is `unavailable`: we do not guess why the fix failed. */
export function failureCode(error: { code?: number } | null | undefined): GpsFailureCode {
  switch (error?.code) {
    case PERMISSION_DENIED:
      return 'denied';
    case TIMEOUT:
      return 'timeout';
    case POSITION_UNAVAILABLE:
      return 'unavailable';
    default:
      return 'unavailable';
  }
}

/**
 * Resolves once, with a fix or with a code. It never rejects: a caller that has to catch is a
 * caller that will end up sending `lat: 0, lon: 0` on the unhappy path.
 */
export function getPosition(): Promise<GpsResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ ok: false, code: 'unsupported' });
  }

  return new Promise<GpsResult>((resolve) => {
    let settled = false;
    const finish = (result: GpsResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    // Belt and braces: a webview that calls neither callback would otherwise leave the screen
    // saying "getting your location" for as long as the worker stares at it. One second of
    // slack past the platform timeout, so a real `TIMEOUT` still reports itself as one.
    const timer = setTimeout(() => finish({ ok: false, code: 'timeout' }), GPS_TIMEOUT_MS + 1000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        const { latitude, longitude, accuracy } = position.coords;
        finish({
          ok: true,
          lat: latitude,
          lon: longitude,
          // A fix with no accuracy figure is still a fix; `0` here would read as "±0 m", so
          // the unknown case takes the worst figure the schema allows rather than the best.
          accuracy_m: Number.isFinite(accuracy) ? accuracy : UNKNOWN_ACCURACY_M,
        });
      },
      (error) => {
        clearTimeout(timer);
        finish({ ok: false, code: failureCode(error) });
      },
      GPS_OPTIONS,
    );
  });
}
