import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The design lives in `globals.css`.
 *
 * Every colour, font, size, background and border is a named `lw-*` class, so a value can be
 * checked against DESIGN-SPEC.md in one file instead of being hunted through forty `style={{
 * … }}` objects. This test is what keeps it that way.
 *
 * Three exceptions, each named rather than pattern-matched:
 *
 * - the two proof `img` boxes, whose source is an object URL for a blob the phone holds in
 *   memory — `next/image` cannot size it and the aspect ratio is per-instance;
 * - the claim-error line in `TaskCard.tsx`. `tests/tasks/claim.test.tsx` reads that element's
 *   `style` attribute and requires `var(--ink-text)` in it — the assertion that a claim
 *   someone else won is drawn in ink and not in the amber of a refusal. The brief holds
 *   every existing test file green and allows one edited line, in `authFlow.test.tsx`, so
 *   the inline colour stays and is listed here instead of being quietly removed.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const SKIP_DIRECTORIES = new Set(['probe', 'node_modules', '.next']);

/** The properties that belong in the stylesheet and nowhere else. */
const DESIGN_PROPERTIES =
  /\b(color|fontFamily|fontSize|fontWeight|background|backgroundColor|border|borderColor|borderRadius|letterSpacing)\b/;

/** `file:line` for every inline style the design pass deliberately kept. */
const ALLOWED = new Set([
  'app/proof/PaidState.tsx',
  'app/proof/ProofFlow.tsx',
  'components/TaskCard.tsx',
]);

function tsxFiles(directory: string, prefix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      found.push(...tsxFiles(join(directory, entry.name), `${prefix}${entry.name}/`));
    } else if (entry.name.endsWith('.tsx')) {
      found.push(`${prefix}${entry.name}`);
    }
  }
  return found;
}

/** Every `style={{ … }}` object in a file, as `{ line, body }`. */
function inlineStyles(source: string): { line: number; body: string }[] {
  const found: { line: number; body: string }[] = [];
  const pattern = /style=\{\{/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const end = source.indexOf('}}', match.index);
    const body = source.slice(match.index, end === -1 ? source.length : end);
    found.push({ line: source.slice(0, match.index).split('\n').length, body });
  }
  return found;
}

describe('the stylesheet is the design', () => {
  it('noInlineColourOrFontInComponents', () => {
    const files = [...tsxFiles(join(ROOT, 'app'), 'app/'), ...tsxFiles(join(ROOT, 'components'), 'components/')];
    expect(files.length).toBeGreaterThan(10);

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      for (const style of inlineStyles(source)) {
        if (!DESIGN_PROPERTIES.test(style.body)) continue;
        if (ALLOWED.has(file)) continue;
        offenders.push(`${file}:${style.line} — ${style.body.replace(/\s+/g, ' ').slice(0, 80)}`);
      }
    }

    expect(offenders, `move these into a lw-* class in app/globals.css:\n${offenders.join('\n')}`).toEqual(
      [],
    );

    // The allowlist is a list, not a licence: each file gets one kept style and no more.
    for (const file of ALLOWED) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      expect(inlineStyles(source).length, file).toBeLessThanOrEqual(1);
    }
  });
});
