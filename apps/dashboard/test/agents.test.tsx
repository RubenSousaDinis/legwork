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
    expect(text).not.toContain('<host>');
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
});
