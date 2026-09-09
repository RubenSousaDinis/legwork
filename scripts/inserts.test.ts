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
 *
 * Since the §15 ruling, length is not one of the things that can fail. A logical line longer
 * than `--width` wraps; only a block that is not three logical lines, or one carrying something
 * that must never be published, is rejected.
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import {
  CAPTIONS,
  CHECKLIST,
  DEFAULT_WIDTH,
  HANGING_INDENT,
  INSERT_LINES,
  INSERT_NAMES,
  InsertInvalid,
  MARGIN,
  extractInsert,
  isPayloadLine,
  readTranscript,
  renderLines,
  validateInsert,
  widthOf,
  wrapLogicalLine,
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
const contentOf = (rendered: string[]): string[] => rendered.filter((line) => line !== '');

describe('insertsAreThreeLines', () => {
  it.each(INSERT_NAMES)('%s is exactly three logical lines', (name) => {
    expect(blockOf(name)).toHaveLength(INSERT_LINES);
  });

  it.each(INSERT_NAMES)('%s renders with no line over the recording width', (name) => {
    for (const line of renderLines(blockOf(name), DEFAULT_WIDTH)) {
      expect(widthOf(line)).toBeLessThanOrEqual(DEFAULT_WIDTH);
    }
  });

  it('wraps the refusal payload rather than rejecting it', () => {
    const refusal = blockOf('refusal');
    const payload = refusal[2] as string;
    // 183 characters, and not shortenable without dropping the class or the no-retry sentence.
    expect(widthOf(payload)).toBeGreaterThan(DEFAULT_WIDTH);
    expect(() => validateInsert(refusal)).not.toThrow();

    const rendered = contentOf(renderLines(refusal, DEFAULT_WIDTH));
    expect(rendered.length).toBeGreaterThan(INSERT_LINES);
    expect(rendered.join('').replace(/\s+/g, ' ')).toContain('do not rephrase and retry');
  });

  it('leaves the hire block on three rendered lines — nothing there wraps at 80', () => {
    expect(contentOf(renderLines(blockOf('hire'), DEFAULT_WIDTH))).toHaveLength(INSERT_LINES);
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
  const refusal = blockOf('refusal');

  it('names the abuse class', () => {
    expect(refusal.join('\n')).toContain('authentication circumvention');
  });

  it('tells the agent not to rephrase and retry', () => {
    expect(refusal.join('\n')).toContain(
      'do not rephrase and retry; report this refusal to your principal',
    );
  });

  it('keeps the class on one rendered line, twice — §9 counts 2', () => {
    // The payload breaks after a comma, not at whichever space falls near the limit, so
    // `"class": "authentication circumvention",` survives the wrap intact.
    const naming = renderLines(refusal, DEFAULT_WIDTH).filter((line) =>
      line.includes('authentication circumvention'),
    );

    expect(naming).toHaveLength(2);
  });
});

describe('invalidBlockIsRejected', () => {
  const threeLines = ['one', 'two', 'three'];
  const longLine = `padded ${'word '.repeat(40)}end`;

  it('rejects a four-line block', () => {
    expect(() => validateInsert([...threeLines, 'four'])).toThrow(InsertInvalid);
    expect(() => validateInsert([...threeLines, 'four'])).toThrow('expected 3 logical lines, got 4');
  });

  it('rejects a four-line block that came out of a marker block', () => {
    const fixture = [
      '<!-- insert:hire:start -->',
      '```text',
      ...threeLines,
      'four',
      '```',
      '<!-- insert:hire:end -->',
    ].join('\n');

    expect(() => validateInsert(extractInsert(fixture, 'hire'))).toThrow(/got 4/);
  });

  it('does not reject a long line — the same fixture at three lines renders wrapped', () => {
    const fixture = [longLine, 'two', 'three'];

    expect(widthOf(longLine)).toBeGreaterThan(DEFAULT_WIDTH);
    expect(() => validateInsert(fixture)).not.toThrow();

    const rendered = contentOf(renderLines(fixture, DEFAULT_WIDTH));
    expect(rendered.length).toBeGreaterThan(fixture.length);
    for (const line of rendered) expect(widthOf(line)).toBeLessThanOrEqual(DEFAULT_WIDTH);
  });

  it('renders the real over-width refusal block and exits 0', () => {
    const run = runCli('--insert', 'refusal', '--hold', '0');

    expect(run.status).toBe(0);
    expect(run.stderr).toBe('');
    for (const line of run.stdout.split('\n')) {
      expect(widthOf(line)).toBeLessThanOrEqual(DEFAULT_WIDTH);
    }
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

  it('exits 1 with INSERT INVALID rather than drawing anything', () => {
    // The CLI funnels every `InsertInvalid` — the four-line block above included — through one
    // handler. This proves the handler: stderr, exit 1, and an untouched stdout.
    const run = runCli('--insert', 'nope', '--hold', '0');

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

describe('wrapLogicalLine', () => {
  it('leaves a line that fits alone', () => {
    expect(wrapLogicalLine('short enough', 78, 76)).toEqual(['short enough']);
  });

  it('breaks at the last space before the limit and drops it', () => {
    expect(wrapLogicalLine('aaa bbb ccc', 7, 7)).toEqual(['aaa bbb', 'ccc']);
  });

  it('breaks a payload after a comma, keeping the comma on the line it ends', () => {
    const payload = '{ "a": "one", "b": "two", "c": "three" }';

    expect(isPayloadLine(payload)).toBe(true);
    expect(wrapLogicalLine(payload, 20, 20)).toEqual([
      '{ "a": "one",',
      '"b": "two",',
      '"c": "three" }',
    ]);
  });

  it('cuts a single token with no break point rather than let it run off the frame', () => {
    expect(wrapLogicalLine('x'.repeat(10), 4, 4)).toEqual(['xxxx', 'xxxx', 'xx']);
  });
});

describe('renderLines', () => {
  it('pads two blank lines above and below behind a two-space margin', () => {
    expect(renderLines(['one', 'two', 'three'])).toEqual([
      '',
      '',
      '  one',
      '  two',
      '  three',
      '',
      '',
    ]);
  });

  it('indents a continuation two further spaces', () => {
    const rendered = contentOf(renderLines(['aaa bbb ccc', 'two', 'three'], 9));

    expect(rendered[0]).toBe(`${MARGIN}aaa bbb`);
    expect(rendered[1]).toBe(`${MARGIN}${HANGING_INDENT}ccc`);
  });

  it('prints the hire block with no escape codes when stdout is not a TTY', () => {
    const run = runCli('--insert', 'hire', '--hold', '0');

    expect(run.status).toBe(0);
    expect(run.stdout).not.toContain('\x1b');
    expect(run.stdout.split('\n').length).toBeGreaterThanOrEqual(7);
  });
});
