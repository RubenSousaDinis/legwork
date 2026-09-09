import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The three things about `globals.css` that are not visible in a component diff: a focus
 * ring in the accent on everything tappable, a reduced-motion block for a worker who asked
 * for one, and the fact that the palette has no red in it at all.
 *
 * `#E5484D` is the status-quo colour of the pitch deck and appears nowhere in the product;
 * the CSS keywords are the ways it could get back in by accident.
 */

const CSS = readFileSync(join(import.meta.dirname, '..', '..', 'app', 'globals.css'), 'utf8');

describe('globals.css', () => {
  it('cssHasFocusRingAndReducedMotionAndNoRed', () => {
    const focusRing = CSS.match(/:focus-visible\s*\{[^}]*\}/);
    expect(focusRing, 'globals.css declares no :focus-visible rule').not.toBeNull();
    expect(focusRing?.[0]).toContain('var(--verified-600)');

    expect(CSS).toContain('prefers-reduced-motion: reduce');
    expect(CSS).toContain('--r-tile:');
    expect(CSS).toContain('--r-card-sm:');
    expect(CSS).toContain('@media (max-width: 639px)');
    expect(CSS).toContain('.lw-nav__tabs');

    // No red token anywhere — not the hex, not a keyword, not in a comment.
    expect(CSS.toLowerCase()).not.toContain('#e5484d');
    for (const keyword of [/\bred\b/i, /\bcrimson\b/i, /orangered/i]) {
      expect(keyword.test(CSS), `globals.css names \`${keyword.source}\``).toBe(false);
    }
  });
});
