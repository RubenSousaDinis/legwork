import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import Page from '../app/page';
import AgentsPage from '../app/agents/page';
import AboutPage from '../app/about/page';
import SupportPage from '../app/support/page';
import { PresentCanvas } from '../app/(present)/PresentCanvas';
import { CLAIM, TAGLINE, TRUST_MODEL, X402_SENTENCE } from '../app/copy';
import { demoDashboardData } from '../lib/data/demo';
import { miniappUrl } from '../lib/urls';

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
});

const NOW = Date.parse('2026-09-05T11:20:00.000Z');

describe('landing', () => {
  it('rootRendersTheLandingAndNotTheBoard', async () => {
    const ui = await Page({ searchParams: Promise.resolve({}) });
    const { container } = render(ui);
    expect(container.textContent).toContain(TAGLINE);
    expect(container.textContent).toContain('I am a person who can go and look');
    expect(container.textContent).toContain('I am an agent, or I build one');
    expect(container.textContent).toContain('World App');
    expect(container.textContent).toContain('World ID');
    expect(container.querySelector('[data-testid="escrow-meter"]')).toBeNull();
  });

  it('presentQueryStillRendersTheCanvas', async () => {
    const ui = await Page({ searchParams: Promise.resolve({ present: '1' }) });
    const { container } = render(ui);
    expect(container.querySelector('[data-testid="escrow-meter"]')).not.toBeNull();
    expect(container.querySelector('.landing-tagline')).toBeNull();
  });

  it('landingLinksToBothPaths', async () => {
    const ui = await Page({ searchParams: Promise.resolve({}) });
    const { container } = render(ui);
    const mini = [...container.querySelectorAll('a')].filter(
      (a) => a.getAttribute('href') === miniappUrl() && a.getAttribute('data-hit') === '44',
    );
    const agents = [...container.querySelectorAll('a')].filter(
      (a) => a.getAttribute('href') === '/agents' && a.getAttribute('data-hit') === '44',
    );
    expect(mini).toHaveLength(1);
    expect(agents).toHaveLength(1);
  });

  it('publicPagesShareTheHeaderAndPresentDoesNot', async () => {
    const headerOn = (root: HTMLElement) => {
      const headers = root.querySelectorAll('.site-header');
      expect(headers).toHaveLength(1);
      const header = headers[0]!;
      expect(header.querySelector('.wordmark')).not.toBeNull();
      expect(header.querySelector('.logo-mark')).not.toBeNull();
      const worker = [...header.querySelectorAll('a')].find((a) => a.getAttribute('href') === miniappUrl());
      expect(worker?.textContent).toMatch(/worker app/);
      expect(worker?.getAttribute('data-hit')).toBeNull();
    };

    headerOn(render(await Page({ searchParams: Promise.resolve({}) })).container);
    cleanup();
    headerOn(render(<AgentsPage />).container);
    cleanup();
    headerOn(render(<AboutPage />).container);
    cleanup();
    headerOn(render(<SupportPage />).container);
    cleanup();

    const present = render(<PresentCanvas data={demoDashboardData({ nowMs: NOW })} nowMs={NOW} />);
    expect(present.container.querySelector('.site-header')).toBeNull();
  });

  it('lockedCopyIsVerbatim', async () => {
    const landing = render(await Page({ searchParams: Promise.resolve({}) })).container;
    expect(landing.textContent).toContain(TAGLINE);
    expect(landing.textContent).toContain(TRUST_MODEL);
    cleanup();

    // at orb (unset WORLD_CREDENTIAL_LEVEL) the locked blocks match copy.ts's current constants
    const about = render(<AboutPage />).container;
    expect(about.textContent).toContain(CLAIM);
    expect(about.textContent).toContain(TRUST_MODEL);

    const agents = render(<AgentsPage />).container;
    expect(agents.textContent).toContain(X402_SENTENCE);
  });
});
