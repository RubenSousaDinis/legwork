import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@worldcoin/idkit-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@worldcoin/idkit-core')>();
  return {
    ...actual,
    selfieCheckLegacy: vi.fn(actual.selfieCheckLegacy),
    orbLegacy: vi.fn(actual.orbLegacy),
  };
});

const { orbLegacy, selfieCheckLegacy } = await import('@worldcoin/idkit-core');
const { pickPreset } = await import('../lib/worldid');

describe('probe', () => {
  beforeEach(() => {
    vi.mocked(selfieCheckLegacy).mockClear();
    vi.mocked(orbLegacy).mockClear();
  });

  it('presetFollowsCredentialLevel', () => {
    pickPreset('selfie');
    expect(selfieCheckLegacy).toHaveBeenCalledWith({ signal: '' });
    expect(orbLegacy).not.toHaveBeenCalled();

    vi.mocked(selfieCheckLegacy).mockClear();
    vi.mocked(orbLegacy).mockClear();

    pickPreset('orb');
    expect(orbLegacy).toHaveBeenCalledWith({ signal: '' });
    expect(selfieCheckLegacy).not.toHaveBeenCalled();

    vi.mocked(orbLegacy).mockClear();

    // Unset falls back to Orb — the §2 default.
    pickPreset(undefined);
    expect(orbLegacy).toHaveBeenCalledWith({ signal: '' });
    expect(selfieCheckLegacy).not.toHaveBeenCalled();
  });
});
