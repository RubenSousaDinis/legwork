/**
 * The three pure pieces of the loop. No network, no chain, no model.
 *
 * The loop itself is the operator's command in `docs/plan/T-29-headless-loop.md` §8 — a test
 * that posted a real task would spend real money on every CI run. What is testable here is
 * what would silently ruin the second rehearsal: a fixture whose bytes repeat (the same
 * content hash for the same place and type auto-disputes), a jitter that wanders outside the
 * geofence, and a formatter that stops ending on `RELEASED`.
 */
import { describe, expect, it } from 'vitest';
import { keccak256 } from 'viem';

import { GEOFENCE_M } from '../packages/shared/src/constants.ts';
import {
  JITTER_MAX_M,
  haversineM,
  jitterCoordinate,
  makeFixtureJpeg,
} from './cli-worker.ts';
import { formatStageLog, moneyLine, type Stage } from './demo-run.ts';

/** The demo place, near enough — the numbers only have to be a real point on Earth. */
const PLACE = { lat: 39.7341702, lon: -8.7995142 };

describe('fixtureBytesDifferPerRun', () => {
  it('hashes two consecutive fixtures differently', async () => {
    const first = await makeFixtureJpeg({ taskId: '41' });
    const second = await makeFixtureJpeg({ taskId: '41' });

    expect(keccak256(new Uint8Array(first))).not.toBe(keccak256(new Uint8Array(second)));
  });

  it('renders 640 × 480 JPEG bytes', async () => {
    const bytes = await makeFixtureJpeg({ taskId: '41' });

    // SOI + APP0/JFIF. Enough to say "this is a JPEG" without decoding it again.
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});

describe('jitterInsideGeofence', () => {
  it('keeps 1000 jittered coordinates within 150 m of the place', () => {
    const distances = Array.from({ length: 1000 }, () =>
      haversineM(PLACE, jitterCoordinate(PLACE)),
    );

    expect(Math.max(...distances)).toBeLessThan(GEOFENCE_M);
    // And inside the radius it was actually asked for, which is a third of the fence.
    expect(Math.max(...distances)).toBeLessThanOrEqual(JITTER_MAX_M);
  });

  it('refuses a radius that would leave the fence', () => {
    expect(() => jitterCoordinate(PLACE, GEOFENCE_M)).toThrow(/fence/);
  });
});

describe('demoRunPrintsReleasedLast', () => {
  const WORKER = '0x7b4EB10df800881f73BC1d85BDeF02f82386271e' as const;
  const TREASURY = '0xABFDB572E3d6093113Cdb9c1C1599E8699226D52' as const;

  const stages: Stage[] = [
    { stage: 'POSTED', tx: '0x'.padEnd(66, 'a'), taskId: '41', detail: 'custody line' },
    { stage: 'CLAIMED', tx: '0x'.padEnd(66, 'b') },
    { stage: 'SUBMITTED', tx: '0x'.padEnd(66, 'c') },
    { stage: 'RELEASED', tx: '0x'.padEnd(66, 'd'), detail: moneyLine(WORKER, TREASURY) },
  ];

  it('ends on RELEASED', () => {
    const lines = formatStageLog(stages).split('\n');

    expect(lines.at(-1)).toMatch(/^RELEASED https:\/\/sepolia\.basescan\.org\/tx\/0x/);
  });

  it('shows both money figures beside the addresses that received them', () => {
    const output = formatStageLog(stages);

    expect(output).toContain(`USDC 3.00 → worker ${WORKER}`);
    expect(output).toContain(`USDC 0.45 → treasury ${TREASURY}`);
    expect(output).toContain('testnet USDC — not spendable');
  });

  it('carries no private-key-length hex', () => {
    const output = formatStageLog(stages);

    // A transaction hash is 32 bytes and so is a private key. Every `0x…` here has to be a
    // link to Basescan; a bare one on its own would be the shape a leaked key arrives in.
    for (const match of output.matchAll(/0x[0-9a-fA-F]{64}/g)) {
      const at = match.index ?? 0;
      expect(output.slice(Math.max(0, at - 40), at)).toContain('sepolia.basescan.org/tx/');
    }
  });

  it('names every stage of the loop', () => {
    const output = formatStageLog(stages);

    for (const stage of ['POSTED task_id=41', 'CLAIMED', 'SUBMITTED', 'RELEASED']) {
      expect(output).toContain(stage);
    }
  });
});
