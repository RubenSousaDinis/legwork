/**
 * The public reads are polled, not requested once: the dashboard's present canvas asks four of
 * them per tick, per viewer. `max-age` alone only talks to the browser, so every viewer's every
 * tick reached Postgres — and on 2026-09-10 that emptied the connection pool and every query in
 * the API began to fail.
 *
 * These assertions are about the header a shared cache reads, not about a number being pretty.
 */
import { describe, expect, it } from 'vitest';
import {
  CACHE_LIVE,
  CACHE_RARE,
  CACHE_SLOW,
  cacheControl,
  publicJson,
} from '../../app/public/_shared';

function directives(header: string): Map<string, string> {
  return new Map(
    header.split(',').map((part) => {
      const [k, v = ''] = part.trim().split('=');
      return [k as string, v];
    }),
  );
}

describe('public cache policy', () => {
  it('sets s-maxage, which is the one a shared cache reads', () => {
    const d = directives(cacheControl(CACHE_LIVE));
    expect(d.has('public')).toBe(true);
    expect(d.get('s-maxage')).toBe(String(CACHE_LIVE.sMaxAge));
  });

  it('lets a shared cache serve a stale answer rather than fail', () => {
    const d = directives(cacheControl(CACHE_SLOW));
    expect(d.get('stale-while-revalidate')).toBe(String(CACHE_SLOW.staleWhileRevalidate));
    // The directive that turns an origin 500 into last-known-good instead of an error page.
    expect(d.get('stale-if-error')).toBe(String(CACHE_SLOW.staleWhileRevalidate));
  });

  it('keeps the board tighter than the counts that barely move', () => {
    expect(CACHE_LIVE.sMaxAge).toBeLessThan(CACHE_SLOW.sMaxAge);
    expect(CACHE_SLOW.sMaxAge).toBeLessThan(CACHE_RARE.sMaxAge);
  });

  it('defaults publicJson to the live policy and honours an explicit one', () => {
    expect(publicJson({}).headers.get('cache-control')).toBe(cacheControl(CACHE_LIVE));
    expect(publicJson({}, CACHE_RARE).headers.get('cache-control')).toBe(cacheControl(CACHE_RARE));
  });

  /** A cached private body would be a leak, not a slow page. Only `public/**` may use this. */
  it('is public-only by construction', () => {
    expect(cacheControl(CACHE_LIVE)).toContain('public');
    expect(cacheControl(CACHE_LIVE)).not.toContain('private');
  });
});
