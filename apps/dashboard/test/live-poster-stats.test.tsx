import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { PosterStats } from '../components/PosterStats';

afterEach(cleanup);

describe('poster stats', () => {
  it('posterStatsSaysZeroInWordsAndCarriesTheAsOfTime', () => {
    // Zero external posters is a real answer, not a missing one.
    const empty = render(
      <PosterStats stats={{ distinctExternalBuyers: 0, externalTasks: 0 }} asOf="10:53:00" />,
    );
    const emptyText = empty.container.textContent ?? '';
    expect(emptyText).toContain('external posters 0 · external tasks 0');
    expect(emptyText).toContain('no external posters yet');
    expect(emptyText).toContain('as of 10:53:00');
    expect(emptyText).toContain('excludes allowlisted buyers');
    cleanup();

    // With real demand the zero-state line is gone and T-10's copy is unchanged.
    const some = render(
      <PosterStats stats={{ distinctExternalBuyers: 1, externalTasks: 2 }} />,
    );
    const someText = some.container.textContent ?? '';
    expect(someText).toContain('external posters 1 · external tasks 2');
    expect(someText).not.toContain('no external posters yet');
    // `asOf` is optional: T-10's call site renders exactly what it rendered before.
    expect(someText).not.toContain('as of');
  });
});
