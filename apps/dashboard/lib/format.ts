/** The presentation-layer string helpers. Every surface formats money through `usdc`. */

/**
 * Re-exported rather than re-implemented: the pool headline is a locked string and
 * two copies of it would be two chances to drift.
 */
export { poolString } from '@legwork/shared';

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
