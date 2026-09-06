import type { Page } from '@playwright/test';

/**
 * The legibility floors, measured rather than assumed.
 *
 * T-10 marks every present-mode element the narration names with `data-floor="24"`
 * or `data-floor="32"` — the floor in *design* pixels. The stage is 1920x1080 with
 * `--u = 1` at the gate's viewport, so a design pixel is a rendered pixel and the
 * delivered 720p frame shows two thirds of it.
 *
 * `fontSize` is read from `getComputedStyle`, never from the attribute and never from
 * a CSS variable: a `transform: scale()` or a `zoom` anywhere above the element would
 * make the declared size a fiction, and the point of this gate is to catch that.
 */

/** A `DOMRect` flattened so it survives the trip out of the page and into JSON. */
export interface FloorBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface FloorRow {
  /** The declared floor in design px: 24 or 32. */
  floor: number;
  /** `parseFloat(getComputedStyle(el).fontSize)` — what is actually rendered. */
  fontSize: number;
  /** The same text in the delivered 1280x720 downscale. */
  rendered720: number;
  /** The first 80 characters of the element's text, for the failure message. */
  text: string;
  box: FloorBox;
  visible: boolean;
  /** True when the element's own overflow is cutting its text off. */
  clipped: boolean;
  tag: string;
  testid: string | null;
}

/** Every `[data-floor]` element on the page, measured in the page. */
export function collectFloors(page: Page): Promise<FloorRow[]> {
  return page.evaluate(() => {
    const rows = [];
    for (const el of Array.from(document.querySelectorAll('[data-floor]'))) {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const fontSize = parseFloat(style.fontSize);
      rows.push({
        floor: Number(el.getAttribute('data-floor')),
        fontSize,
        rendered720: (fontSize * 720) / 1080,
        text: (el.textContent ?? '').trim().slice(0, 80),
        box: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        visible:
          rect.width > 0 && rect.height > 0 && style.opacity !== '0' && style.visibility !== 'hidden',
        clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute('data-testid'),
      });
    }
    return rows;
  });
}

/** Two decimals, without a trailing `.00` on a whole number. */
function px(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * The floors that do not hold, one message each. An empty list is the pass.
 *
 * Nothing here edits anything: a failure is reported to T-10 / T-43 as a finding.
 * Lowering a floor to make this return `[]` defeats the whole task.
 */
export function assertFloors(rows: FloorRow[]): string[] {
  const failures: string[] = [];
  for (const row of rows) {
    const needed = (row.floor * 2) / 3;
    // A hair of tolerance for the binary fraction in 32 * 2 / 3.
    if (row.rendered720 < needed - 1e-9) {
      failures.push(
        `${row.text} · floor ${row.floor} · computed ${px(row.fontSize)}px · at 720p ` +
          `${px(row.rendered720)}px (needs ≥ ${px(needed)}px)`,
      );
    }
  }
  return failures;
}
