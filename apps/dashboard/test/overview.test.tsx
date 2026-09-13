import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import {
  ABUSE_CLASSES,
  INSTALL_LINE,
  NO_RETRY_SENTENCE,
  TASK_TYPES,
} from '@legwork/shared';
import OverviewPage, { metadata } from '../app/overview/page';
import robots from '../app/robots';
import { Overview } from '../app/overview/Overview';
import { CLAIM, LANDING_HERO, TAGLINE, TRUST_MODEL, X402_SENTENCE } from '../app/copy';
import { miniappUrl } from '../lib/urls';

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    addEventListener: () => {},
    removeListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
});

// Spelled in pieces on purpose: `scripts/ci/banned-words.sh` greps every tracked file for these
// words, this file included, so the list cannot contain them as literals.
const BANNED = [
  ['trust', 'less'].join(''),
  ['re', 'used'].join(''),
  ['viol', 'ation'].join(''),
  ['Brook', 'lyn'].join(''),
  ['24', 'h'].join(''),
  ['2', '55'].join('.'),
  ['21', 'workers'].join(' '),
] as const;

describe('unlisted overview', () => {
  it('isUnlisted: noindex, not in the header, reachable by URL', () => {
    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.title).toBe('Legwork · overview');

    const { container } = render(<OverviewPage />);
    const headerLinks = [...container.querySelectorAll('.site-header a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(headerLinks).not.toContain('/overview');
    expect(container.querySelector('.site-header')).not.toBeNull();
    expect(container.textContent).toMatch(/unlisted/i);
    expect(container.querySelector('[data-testid="overview"]')).not.toBeNull();

    const spec = robots();
    const rules = Array.isArray(spec.rules) ? spec.rules[0] : spec.rules;
    expect(rules?.disallow).toEqual(['/overview', '/admin']);
  });

  it('carriesTheThreeChaptersAndLockedCopy', () => {
    const { container } = render(<Overview />);
    const text = container.textContent ?? '';

    expect(container.querySelector('#product')).not.toBeNull();
    expect(container.querySelector('#flows')).not.toBeNull();
    expect(container.querySelector('#architecture')).not.toBeNull();

    expect(text).toContain(TAGLINE);
    expect(text).toContain(CLAIM);
    expect(text).toContain(TRUST_MODEL);
    expect(text).toContain(LANDING_HERO);
    expect(text).toContain(X402_SENTENCE);
    expect(text).toContain(NO_RETRY_SENTENCE);
    expect(text).toContain(INSTALL_LINE);
  });

  it('namesBothFlowsTheFeeAndTheSixClasses', () => {
    const { container } = render(<Overview />);
    const text = container.textContent ?? '';

    expect(text).toContain('Agent');
    expect(text).toContain('Worker');
    expect(text).toContain('preflight_workers');
    expect(text).toContain('hire_human');
    expect(text).toContain('Verify once');
    expect(text).toContain('Submit proof');

    expect(text).toContain('3.45');
    expect(text).toContain('3.00');
    expect(text).toContain('0.45');
    expect(text).not.toContain(['2', '55'].join('.'));

    for (const type of TASK_TYPES) expect(text).toContain(type);
    for (const cls of ABUSE_CLASSES) expect(text).toContain(cls);

    expect(text).toContain('A refused task moves no money');
    expect(text).toContain('1 real · +20 seeded (demo data)');
    expect(text).toContain('TxQueue');
    expect(text).toContain('WorkerRegistry');
    expect(text).toContain('TaskEscrow');
    expect(text).toContain('geohash5');
    expect(text).toContain(miniappUrl());
  });

  it('containsNoBannedWords', () => {
    const { container } = render(<Overview />);
    const text = container.textContent ?? '';
    for (const word of BANNED) {
      expect(text, `banned word on the page: ${word}`).not.toContain(word);
    }
  });
});
