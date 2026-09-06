'use client';

import { PUBLIC_COORD_DECIMALS } from '@legwork/shared';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import type { GpsResult } from '../../lib/gps';

/**
 * Step 2: where the phone thinks it is, or the honest fact that it does not know.
 *
 * The downgrade is not a fallback bolted on for the demo — World App exposes no location
 * permission, so a webview with no fix is the expected case, and the path was decided in
 * advance: photo + server timestamp + the worker's tapped confirmation, disclosed. What is
 * never allowed is inventing a coordinate. There is no `lat: 0` anywhere on this path; the
 * request simply carries no `lat`/`lon` at all, and the receipt carries the chip.
 *
 * A photo is required either way. A location never is.
 */

export const LOCATING_LINE = 'Getting your location (up to 10 s)';
export const DOWNGRADE_LINE = 'Location unavailable in this webview — disclosed on the receipt';
export const GPS_CHIP = 'GPS unavailable in webview — disclosed';
export const AT_THE_PLACE = 'I am at the place';
export const RETRY_LOCATION = 'Retry location';

/** The only precision a coordinate is shown at — 3 decimals, ≈100 m (`PUBLIC_COORD_DECIMALS`). */
export function roundedCoordinate(lat: number, lon: number): string {
  return `${lat.toFixed(PUBLIC_COORD_DECIMALS)}, ${lon.toFixed(PUBLIC_COORD_DECIMALS)}`;
}

export type DowngradeProps = {
  confirmed: boolean;
  onConfirm: () => void;
  onRetry: () => void;
};

/** The panel a failed fix leaves behind. The chip is up before the worker taps anything. */
export function Downgrade({ confirmed, onConfirm, onRetry }: DowngradeProps) {
  return (
    <div data-downgrade="true" style={{ marginBottom: 'var(--s-4)' }}>
      <p data-floor="20" style={{ margin: '0 0 var(--s-3)' }}>
        {DOWNGRADE_LINE}
      </p>

      <p style={{ margin: '0 0 var(--s-3)' }}>
        <Chip tone="neutral" floor={20}>
          {GPS_CHIP}
        </Chip>
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
        {confirmed ? (
          <p data-confirmed="true" style={{ margin: 0 }}>
            <Chip tone="verified" floor={20}>
              {`${AT_THE_PLACE} ✓`}
            </Chip>
          </p>
        ) : (
          <Button variant="ghost" onClick={onConfirm}>
            {AT_THE_PLACE}
          </Button>
        )}

        {/* Always offered: a fix that failed once may land on the second try, and a real
            coordinate is worth more to the receipt than a tapped confirmation. */}
        <Button variant="ghost" onClick={onRetry}>
          {RETRY_LOCATION}
        </Button>
      </div>
    </div>
  );
}

export type LocationStepProps = {
  status: 'idle' | 'locating' | 'done';
  result: GpsResult | null;
  confirmed: boolean;
  onConfirm: () => void;
  onRetry: () => void;
};

/** Locating, a fix, or the downgrade. Nothing renders before the photo exists. */
export function LocationStep({ status, result, confirmed, onConfirm, onRetry }: LocationStepProps) {
  if (status === 'idle') return null;

  if (status === 'locating') {
    return (
      <p data-location="locating" data-floor="20" style={{ margin: '0 0 var(--s-4)' }}>
        {LOCATING_LINE}
      </p>
    );
  }

  if (result !== null && result.ok) {
    return (
      <div data-location="fix" style={{ marginBottom: 'var(--s-4)' }}>
        <p data-floor="20" style={{ margin: '0 0 var(--s-2)' }}>
          {`±${Math.round(result.accuracy_m)} m`}
        </p>
        <p className="lw-placeholder" data-coordinate="rounded" style={{ margin: '0 0 var(--s-3)' }}>
          {roundedCoordinate(result.lat, result.lon)}
        </p>
        <Button variant="ghost" onClick={onRetry}>
          {RETRY_LOCATION}
        </Button>
      </div>
    );
  }

  return <Downgrade confirmed={confirmed} onConfirm={onConfirm} onRetry={onRetry} />;
}
