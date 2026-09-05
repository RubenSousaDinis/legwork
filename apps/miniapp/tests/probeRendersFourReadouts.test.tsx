import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProbeReadouts } from '../app/probe/ProbeReadouts';
import { requestRpContext, verifyProof, type ProbeResults } from '../lib/probeApi';
import { IDKIT_RESULT_FIXTURE } from './fixtures';

describe('probe', () => {
  it('probeRendersFourReadouts', async () => {
    const { rp_context } = await requestRpContext('legwork-worker');
    expect(rp_context).toEqual({
      rp_id: expect.any(String),
      nonce: expect.any(String),
      created_at: expect.any(Number),
      expires_at: expect.any(Number),
      signature: expect.any(String),
    });

    const verified = await verifyProof(IDKIT_RESULT_FIXTURE);
    expect(verified.verified).toBe(true);
    expect(verified.nullifier).toEqual(expect.any(String));
    expect(verified.level).toEqual(expect.any(String));

    const results: ProbeResults = {
      ran_at: '2026-09-05T09:00:00.000Z',
      level_env: 'orb',
      idkit: {
        preset: 'orbLegacy',
        rp_context: { nonce: rp_context.nonce, expires_at: rp_context.expires_at },
        widget_result: { ...IDKIT_RESULT_FIXTURE },
        api_response: {
          verified: verified.verified,
          nullifier: verified.nullifier,
          level: verified.level,
        },
        error: null,
      },
      camera: {
        name: 'proof.jpg',
        size: 1_248_512,
        type: 'image/jpeg',
        lastModified: 1_757_030_400_000,
        camera_opened_directly: true,
      },
      geolocation: {
        ok: true,
        lat: 39.749,
        lon: -8.807,
        accuracy_m: 18,
        time_to_fix_ms: 1_420,
      },
      walletAuth: {
        ok: true,
        executedWith: 'minikit',
        address: '0x00000000000000000000000000000000000f0417',
        message: 'localhost wants you to sign in with your Ethereum account:',
        signature_preview: '0x2f7a1c9e…d4b706',
      },
      env: {
        minikit_installed: true,
        user_agent: 'probe',
        viewport: '390 × 844',
        level_env: 'orb',
      },
    };

    const { container } = render(<ProbeReadouts results={results} />);

    const readouts = Array.from(container.querySelectorAll('[data-readout]')).map((node) =>
      node.getAttribute('data-readout'),
    );
    expect(readouts).toEqual(['idkit', 'camera', 'geolocation', 'walletAuth']);

    const dump = container.querySelector('pre.lw-json');
    expect(dump?.textContent).toContain('"nullifier"');
  });
});
