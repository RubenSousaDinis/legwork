import type { IDKitDebugReport } from '@worldcoin/idkit';
import { describe, expect, it } from 'vitest';
import { IdkitFailure, summarizeDebugReport } from '../lib/worldid';

const REPORT: IDKitDebugReport = {
  version: 1,
  package_version: '4.2.3',
  transport: 'mini_app',
  generated_at: '2026-09-07T22:39:00.000Z',
  request_id: 'req_1',
  response_payload: '{"error_code":"verification_disabled"}',
};

describe('idkit failure', () => {
  it('idkitFailureCarriesTheReport', () => {
    const failure = new IdkitFailure('verification_disabled', REPORT);
    expect(failure.message).toBe('verification_disabled');
    expect(failure.code).toBe('verification_disabled');
    expect(failure.report).toBe(REPORT);

    expect(summarizeDebugReport(REPORT)).toBe(
      'mini_app · request req_1 · {"error_code":"verification_disabled"}',
    );
    expect(summarizeDebugReport(undefined)).toBe('');
    expect(summarizeDebugReport({ ...REPORT, response_payload: { detail: 'x' } })).toBe(
      'mini_app · request req_1 · {"detail":"x"}',
    );

    // A long payload is cut so the line stays readable on a phone; the console has the rest.
    const long = summarizeDebugReport({ ...REPORT, response_payload: 'a'.repeat(1000) });
    expect(long.length).toBeLessThan(460);
    expect(long.endsWith('…')).toBe(true);
  });
});
