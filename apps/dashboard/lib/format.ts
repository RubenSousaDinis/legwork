/** The presentation-layer string helpers. Every surface formats money through `usdc`. */

/**
 * Re-exported rather than re-implemented: the pool headline is a locked string and
 * two copies of it would be two chances to drift.
 */
export { poolString } from '@legwork/shared';

/** Imported, never retyped: 3 decimals is about 100 m and the number is frozen. */
import { PUBLIC_COORD_DECIMALS } from '@legwork/shared';

/** Always two decimals: `3.45`, `3.00`, `0.45`. Never a deducted figure. */
export function usdc(n: number): string {
  return n.toFixed(2);
}

/** `t+04:12 since posted`. Clamped at zero so a clock skew cannot print a negative. */
export function elapsed(fromIso: string, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((nowMs - Date.parse(fromIso)) / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `t+${mm}:${ss} since posted`;
}

/** Seconds to `23 min` / `1 h 40 min`. Hours always carry a space — never `<n>h`. */
export function duration(s: number): string {
  const minutes = Math.max(0, Math.round(s / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** `HH:MM:SS` in the viewer's local time. T-43 syncs the source of `nowMs` to the API. */
export function clockTime(nowMs: number): string {
  const d = new Date(nowMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** `0x8f2a…c41d` — the elided form used for spec hashes and tx hashes alike. */
export function shortHash(hash: string): string {
  if (hash.length <= 12 || hash.includes('…')) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

/** `HH:MM:SS` of an ISO instant, for the `proof ✓ <captured_at>` line. */
export function timeOf(iso: string): string {
  return clockTime(Date.parse(iso));
}

/** The one explorer this deployment links to. Base Sepolia, never mainnet. */
const BASESCAN = 'https://sepolia.basescan.org';

/** `https://sepolia.basescan.org/tx/0x…` — every tx link on every surface. */
export function basescanTx(hash: string): string {
  return `${BASESCAN}/tx/${hash}`;
}

/** `https://sepolia.basescan.org/address/0x…`. */
export function basescanAddress(address: string): string {
  return `${BASESCAN}/address/${address}`;
}

/**
 * `≈ 39.744, −8.807 · rounded to ~100 m`. Public surfaces round to
 * `PUBLIC_COORD_DECIMALS` and never render a digit past it — the exact coordinate
 * stays in the private task record. The sign is a unicode minus, not a hyphen.
 */
export function coord(lat: number, lon: number): string {
  const fixed = (n: number) => n.toFixed(PUBLIC_COORD_DECIMALS).replace(/^-/, '−');
  return `≈ ${fixed(lat)}, ${fixed(lon)} · rounded to ~100 m`;
}
