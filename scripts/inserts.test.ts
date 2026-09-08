/**
 * The pure pieces of the two inserts, plus the CLI's two exit paths. No network, no chain,
 * no model — the whole script reads one committed markdown file.
 *
 * What these tests are really guarding is the frame. The inserts go on camera and stay
 * published, so the assertions are about what must be on screen (`3.45`, the status codes,
 * the class, the no-retry sentence) and what must never be (a URL, a 64-character hex string,
 * an API key, a live `buyer_token`). The secret-shaped fixtures below are built by
 * concatenation on purpose: a literal one would be a secret in the commit patch, which is the
 * thing this file exists to prevent.
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import {
  CAPTIONS,
  CHECKLIST,
  DEFAULT_WIDTH,
  INSERT_LINES,
  INSERT_NAMES,
  InsertInvalid,
  extractInsert,
  readTranscript,
  renderInsert,
  validateInsert,
  widthOf,
  type InsertName,
} from './inserts.ts';

const TSX = new URL('node_modules/.bin/tsx', import.meta.url).pathname;
const SCRIPT = new URL('inserts.ts', import.meta.url).pathname;

/** Runs the CLI the way the operator does, capturing status and both streams. */
function runCli(...args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(TSX, [SCRIPT, ...args], { encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
}

const md = readTranscript();
const blockOf = (name: InsertName): string[] => extractInsert(md, name);

describe('insertsAreThreeLines', () => {
  it.each(INSERT_NAMES)('%s is exactly three lines', (name) => {
    expect(blockOf(name)).toHaveLength(INSERT_LINES);
  });

  it.each(INSERT_NAMES)('%s has no line wider than the recording width', (name) => {
    for (const line of blockOf(name)) {
      expect(widthOf(line)).toBeLessThanOrEqual(DEFAULT_WIDTH);
    }
  });
});

describe('insertsContainNoSecretsOrUrls', () => {
  it.each(INSERT_NAMES)('%s carries no URL, hex string, key or live token', (name) => {
    for (const line of blockOf(name)) {
      expect(line).not.toMatch(/https?:\/\//);
      expect(line).not.toMatch(/[0-9a-fA-F]{64}/);
      expect(line).not.toContain(`sk-${'ant'}`);
      expect(line.includes('buyer_token') && !line.includes('<redacted>')).toBe(false);
    }
  });
});

describe('hireInsertShowsPriceAndStatusCodes', () => {
  const hire = blockOf('hire').join('\n');

  it('shows the 402 challenge and the price the agent pays', () => {
    expect(hire).toContain('402');
    expect(hire).toContain('3.45');
  });

  it('shows the created-task code the API really returned', () => {
    expect(hire).toMatch(/\b20[01]\b/);
  });
});

describe('refusalInsertNamesClassAndNoRetry', () => {
  const refusal = blockOf('refusal').join('\n');

  it('names the abuse class', () => {
    expect(refusal).toContain('authentication circumvention');
  });

  it('tells the agent not to rephrase and retry', () => {
    expect(refusal).toContain('do not rephrase and retry; report this refusal to your principal');
  });
});

describe('invalidBlockIsRejected', () => {
  const threeLines = ['one', 'two', 'three'];

  it('rejects a four-line block', () => {
    expect(() => validateInsert([...threeLines, 'four'])).toThrow(InsertInvalid);
    expect(() => validateInsert([...threeLines, 'four'])).toThrow('expected 3 lines, got 4');
  });

  it('rejects a line wider than the width', () => {
    expect(() => validateInsert(['x'.repeat(81), 'two', 'three'])).toThrow(/over the 80-character/);
  });

  it('rejects a URL', () => {
    expect(() => validateInsert(['one', 'https://legwork.example/t/19', 'three'])).toThrow('URL');
  });

  it('rejects a 64-character hex string', () => {
    const hex64 = 'ab'.repeat(32);
    expect(() => validateInsert(['one', `tx ${hex64}`, 'three'])).toThrow(/64-character hex/);
  });

  it('rejects an Anthropic key and an unredacted buyer_token', () => {
    expect(() => validateInsert(['one', `sk-${'ant'}-abc123`, 'three'])).toThrow(/API key/);
    expect(() => validateInsert(['one', '"buyer_token": "btk_live_9"', 'three'])).toThrow(
      /buyer_token/,
    );
    expect(() => validateInsert(['one', '"buyer_token": "<redacted>"', 'three'])).not.toThrow();
  });

  it('exits 1 with INSERT INVALID rather than drawing a bad block', () => {
    // Width 40 makes the real hire block too wide — the same failure path a bad block takes.
    const run = runCli('--insert', 'hire', '--width', '40', '--hold', '0');

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('INSERT INVALID:');
    expect(run.stdout).toBe('');
  });
});

describe('checklistAndCaptionsVerbatim', () => {
  it('prints the six pre-record checklist sentences', () => {
    const run = runCli('--print-checklist');

    expect(run.status).toBe(0);
    expect(CHECKLIST).toHaveLength(6);
    for (const sentence of CHECKLIST) expect(run.stdout).toContain(sentence);
  });

  it('prints exactly the five captions, one per line', () => {
    const run = runCli('--print-captions');

    expect(run.status).toBe(0);
    expect(run.stdout.split('\n').filter((line) => line !== '')).toEqual([...CAPTIONS]);
  });

  it('reads the pool as seeded rows, never a worker total', () => {
    expect(CAPTIONS[4]).toBe('1 real worker · +20 seeded rows — disclosed.');
  });
});

describe('renderInsert', () => {
  it('pads two blank lines above and below behind a two-space margin', () => {
    const lines = renderInsert(['one', 'two', 'three']).split('\n');

    expect(lines).toEqual(['', '', '  one', '  two', '  three', '', '']);
  });

  it('prints the block with no escape codes when stdout is not a TTY', () => {
    const run = runCli('--insert', 'hire', '--hold', '0');

    expect(run.status).toBe(0);
    expect(run.stdout).not.toContain('\x1b');
    expect(run.stdout.split('\n').length).toBeGreaterThanOrEqual(7);
  });
});
