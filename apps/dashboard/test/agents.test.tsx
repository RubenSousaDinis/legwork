import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ABUSE_CLASSES } from '@legwork/shared';
import AgentsPage from '../app/agents/page';
import { X402_SENTENCE } from '../app/copy';
import { apiUrl } from '../lib/urls';

afterEach(cleanup);

describe('agents page', () => {
  it('agentsPagePrintsARealHostNotAPlaceholder', () => {
    const { container } = render(<AgentsPage />);
    const text = container.textContent ?? '';
    expect(text).toContain(`claude mcp add --transport http legwork ${apiUrl()}/mcp`);
    expect(apiUrl()).not.toMatch(/localhost|127\.0\.0\.1/);
    expect(text).not.toContain('<host>');
    expect(text).not.toContain('localhost');
    expect(text).not.toContain('127.0.0.1');
  });

  it('agentsPageCarriesTheSixClassesAndTheFeeLine', () => {
    const { container } = render(<AgentsPage />);
    const text = container.textContent ?? '';
    for (const cls of ABUSE_CLASSES) expect(text).toContain(cls);
    expect(text).toContain('3.45');
    expect(text).toContain('3.00');
    expect(text).toContain('0.45');
    expect(text).toContain(X402_SENTENCE);
  });

  it('agentsPageStatesTheNewLimitNotTheOldOne', () => {
    const { container } = render(<AgentsPage />);
    const text = container.textContent ?? '';
    expect(text).toContain('resolves live');
    expect(text).toContain('Overpass');
    expect(text).toContain('503');
    expect(text).toContain('packaged index');
    expect(text).not.toContain('Leiria-only');
    expect(text).not.toContain('(Portuguese)');
  });
});
