import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DeckPage from '../app/deck/page';
import { CLAIM, TRUST_MODEL } from '../app/copy';

afterEach(cleanup);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkTsx(p));
    else if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

describe('deck', () => {
  it('deckHasThirteenBoardsInOrder', () => {
    const { container } = render(<DeckPage />);
    const boards = [...container.querySelectorAll('.deck-board')];
    expect(boards).toHaveLength(13);
    expect(boards.map((b) => b.id)).toEqual(Array.from({ length: 13 }, (_, i) => `board-${i + 1}`));
    const board4 = container.querySelector('#board-4')!;
    expect(board4.textContent).toContain(CLAIM);
    expect(board4.textContent).toContain(TRUST_MODEL);
  });

  it('deckIsTheOnlyPlaceRedAppears', () => {
    const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');
    const lower = css.toLowerCase();
    const idx = lower.indexOf('e5484d');
    expect(idx).toBeGreaterThan(-1);
    expect(lower.indexOf('e5484d', idx + 1)).toBe(-1);
    const before = css.slice(0, idx);
    const lastBoard = before.lastIndexOf('.deck-board');
    expect(lastBoard).toBeGreaterThan(-1);
    expect(before.slice(lastBoard)).toMatch(/\.deck-board\s*\{[^}]*$/);

    for (const file of [...walkTsx(join(ROOT, 'app')), ...walkTsx(join(ROOT, 'components'))]) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/e5484d/i);
    }
  });

  it('deckCarriesTodaysFactsNotThePlans', () => {
    const { container } = render(<DeckPage />);
    const text = container.textContent ?? '';
    expect(text).toContain('World ID · Orb');
    expect(text).not.toContain('sandbox World ID');
    expect(text).not.toContain('<domain>');
    expect(text).not.toContain('<host>');
    const board10 = container.querySelector('#board-10')!;
    expect(board10.textContent).toContain('1 real · +20 seeded (demo data)');
  });
});
