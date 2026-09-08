/**
 * The two terminal inserts, one at a time, full screen.
 *
 *   pnpm --filter scripts inserts -- --insert hire|refusal [--width 80] [--hold 3]
 *   pnpm --filter scripts inserts -- --print-checklist
 *   pnpm --filter scripts inserts -- --print-captions
 *
 * The video shows the terminal twice, for three seconds each, and never as a persistent pane.
 * So this script owns the whole screen for those three seconds and puts nothing on it but the
 * three lines: no prompt, no path, no URL, no key, no colour. The operator sets the theme and
 * the font size; the script only pads.
 *
 * Nothing here is typed from the storyboard. Both blocks are lifted out of `examples/transcript.md`
 * (T-34) between its `insert:<name>` markers, and those are copies of what really came back —
 * the hire lines are the local MCP binary's `LEGWORK_INSERT=1` stderr (T-28) minus the trailing
 * dashboard URL. Where the storyboard and the transcript disagree, the transcript wins: the
 * created task answers `201 { task_id: … }`, not the storyboard's `200 {taskId}`.
 *
 * The validator is the reason this is a script rather than a screenshot. The terminal is
 * published forever, so a URL, a key or a 64-character hex string reaching the frame is not a
 * cosmetic problem — it is checked before anything is drawn, and a failure prints
 * `INSERT INVALID: <reason>` and exits 1.
 */
import { readFileSync } from 'node:fs';

/** The two marked blocks, and the only two things `--insert` accepts. */
export const INSERT_NAMES = ['hire', 'refusal'] as const;
export type InsertName = (typeof INSERT_NAMES)[number];

/** Every insert is three lines. Two would not be the shape the video cuts to; four would wrap. */
export const INSERT_LINES = 3;

/** Columns a line may occupy at the recording font size. `--width` overrides it. */
export const DEFAULT_WIDTH = 80;

/** Seconds the insert stays on screen. The cut is three seconds long. */
export const DEFAULT_HOLD_S = 3;

/** Blank lines above and below the block. */
export const PAD_LINES = 2;

/** Left margin, in spaces. */
export const MARGIN = '  ';

/** The only `buyer_token` value allowed to reach the screen. */
export const REDACTED = '<redacted>';

/** Thrown by `extractInsert` and `validateInsert`. The CLI turns it into `INSERT INVALID: …`. */
export class InsertInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsertInvalid';
  }
}

// ------------------------------------------------------------------ the source

/** Where the two blocks live. T-34 owns the file; this script only reads it. */
export const TRANSCRIPT_PATH = new URL('../examples/transcript.md', import.meta.url);

export function readTranscript(): string {
  return readFileSync(TRANSCRIPT_PATH, 'utf8');
}

/**
 * The fenced block between `<!-- insert:<name>:start -->` and `<!-- insert:<name>:end -->`,
 * as lines, fences dropped. Nothing is trimmed, reflowed or filtered: a stray blank line
 * inside the block is a fourth line and the validator says so, rather than being silently
 * swallowed here and surprising the operator on camera.
 */
export function extractInsert(md: string, name: InsertName): string[] {
  const open = `<!-- insert:${name}:start -->`;
  const close = `<!-- insert:${name}:end -->`;
  const from = md.indexOf(open);
  const to = md.indexOf(close);
  if (from === -1 || to === -1 || to < from) {
    throw new InsertInvalid(`no insert:${name} block in examples/transcript.md`);
  }

  const body = md.slice(from + open.length, to).split('\n');
  const fences = body
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim().startsWith('```'))
    .map(({ index }) => index);
  const [opening, closing] = fences;
  if (opening === undefined || closing === undefined) {
    throw new InsertInvalid(`insert:${name} block is not fenced in examples/transcript.md`);
  }

  return body.slice(opening + 1, closing);
}

// --------------------------------------------------------------- the validator

const URL_RE = /https?:\/\//;
const HEX64_RE = /[0-9a-fA-F]{64}/;
const ANTHROPIC_RE = /sk-ant/;
const BUYER_TOKEN_RE = /buyer_token"?\s*[:=]\s*"?([^",\s}]+)/g;

/** Characters, not bytes: `·`, `…` and `á` each take one column in a monospace terminal. */
export function widthOf(line: string): number {
  return [...line].length;
}

/**
 * Everything that must be true before the screen is cleared. Returns the lines so a caller can
 * chain; throws `InsertInvalid` with the reason the operator needs, naming the line.
 */
export function validateInsert(lines: string[], width: number = DEFAULT_WIDTH): string[] {
  if (lines.length !== INSERT_LINES) {
    throw new InsertInvalid(`expected ${INSERT_LINES} lines, got ${lines.length}`);
  }

  lines.forEach((line, index) => {
    const at = `line ${index + 1}`;
    const columns = widthOf(line);
    if (columns > width) {
      throw new InsertInvalid(`${at} is ${columns} characters, over the ${width}-character width`);
    }
    if (URL_RE.test(line)) throw new InsertInvalid(`${at} carries a URL`);
    if (HEX64_RE.test(line)) throw new InsertInvalid(`${at} carries a 64-character hex string`);
    if (ANTHROPIC_RE.test(line)) throw new InsertInvalid(`${at} carries an Anthropic API key`);
    for (const [, value] of line.matchAll(BUYER_TOKEN_RE)) {
      if (value !== REDACTED) {
        throw new InsertInvalid(`${at} carries a buyer_token that is not ${REDACTED}`);
      }
    }
  });

  return lines;
}

/** Read, extract and validate in one step — what `--insert` does before it draws anything. */
export function loadInsert(name: InsertName, width: number = DEFAULT_WIDTH): string[] {
  return validateInsert(extractInsert(readTranscript(), name), width);
}

// ----------------------------------------------------------------- the printer

/**
 * The block as it reaches the screen: two blank lines, the three lines behind a two-space
 * margin, two blank lines. No colour codes — the operator's theme is the only styling.
 */
export function renderInsert(lines: string[]): string {
  const blank = Array<string>(PAD_LINES).fill('');
  return [...blank, ...lines.map((line) => `${MARGIN}${line}`), ...blank].join('\n');
}

/** Clear and home. Sent only to a TTY: piped output is read as text, not watched. */
export const CLEAR = '\x1b[2J\x1b[H';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

const sleep = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

export async function showInsert(
  lines: string[],
  { hold, tty }: { hold: number; tty: boolean },
): Promise<void> {
  if (tty) process.stdout.write(CLEAR + HIDE_CURSOR);
  process.stdout.write(`${renderInsert(lines)}\n`);
  if (hold > 0) await sleep(hold);
  if (tty) process.stdout.write(SHOW_CURSOR);
}

// ------------------------------------------------------- checklist and captions

/**
 * Ticked once, out loud, before the first take. The terminal is published forever and the
 * recording is the last moment anything can be taken back off it.
 */
export const CHECKLIST: readonly string[] = [
  'No `.env` open; no RPC, Anthropic or private keys in scrollback; shell history cleared of `cast send --private-key`; a fresh terminal session for the inserts.',
  'Notifications off on every device; tunnel/host URLs not legible unless intended.',
  'Demo state reset with `demo:reset`; the agent card at 0 marks before beat 6.',
  "The demo worker's World ID has NOT been registered in testing (or `resetWorker` used).",
  'Clocks on both panes agree.',
  'Export at 1080p; check length and codec against whatever the form accepts (file or URL — ask in Discord); upload a rough assembly on Sept 12, not at 15:50 on Sept 13.',
];

/**
 * The five burned-in captions, for the operator's caption pass on the Day-9 composite. They are
 * reference text: `--insert` never prints them, and burning them in is the edit, not this script.
 */
export const CAPTIONS: readonly string[] = [
  'Bot-proof, not fraud-proof.',
  'Escrow releases on proof.',
  "Refused at the API — and written to the agent's record.",
  'One World ID nullifier = one worker.',
  '1 real worker · +20 seeded rows — disclosed.',
];

// ----------------------------------------------------------------------- the CLI

type Options = {
  insert?: InsertName;
  width: number;
  hold?: number;
  checklist: boolean;
  captions: boolean;
};

const isInsertName = (value: string): value is InsertName =>
  (INSERT_NAMES as readonly string[]).includes(value);

const numberArg = (flag: string, raw: string | undefined): number => {
  const value = Number(raw);
  if (raw === undefined || !Number.isFinite(value) || value < 0) {
    throw new InsertInvalid(`${flag} needs a non-negative number`);
  }
  return value;
};

export function parseArgs(argv: readonly string[]): Options {
  const options: Options = { width: DEFAULT_WIDTH, checklist: false, captions: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    switch (flag) {
      // `pnpm --filter scripts inserts -- --insert hire` forwards the separator itself, so the
      // documented invocation really does arrive with a bare `--` in argv. Skip it.
      case '--':
        break;
      case '--insert': {
        const name = argv[(i += 1)];
        if (name === undefined || !isInsertName(name)) {
          throw new InsertInvalid(`--insert takes ${INSERT_NAMES.join(' or ')}`);
        }
        options.insert = name;
        break;
      }
      case '--width':
        options.width = numberArg('--width', argv[(i += 1)]);
        break;
      case '--hold':
        options.hold = numberArg('--hold', argv[(i += 1)]);
        break;
      case '--print-checklist':
        options.checklist = true;
        break;
      case '--print-captions':
        options.captions = true;
        break;
      default:
        throw new InsertInvalid(`unknown argument ${flag}`);
    }
  }
  return options;
}

const USAGE =
  'usage: inserts --insert hire|refusal [--width 80] [--hold 3] | --print-checklist | --print-captions';

async function main(argv: readonly string[]): Promise<void> {
  const options = parseArgs(argv);

  if (options.checklist) {
    process.stdout.write(`${CHECKLIST.join('\n')}\n`);
    return;
  }
  if (options.captions) {
    process.stdout.write(`${CAPTIONS.join('\n')}\n`);
    return;
  }
  if (options.insert === undefined) throw new InsertInvalid(USAGE);

  // Piped output is somebody reading the text, not the operator watching the screen: no clear,
  // no cursor games, and no reason to hold. `--hold` is the only knob a TTY changes the default of.
  const tty = process.stdout.isTTY === true;
  await showInsert(loadInsert(options.insert, options.width), {
    hold: options.hold ?? (tty ? DEFAULT_HOLD_S : 0),
    tty,
  });
}

/** `tsx inserts.ts …` runs; `import` from the test does not. */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`INSERT INVALID: ${reason}\n`);
    process.exitCode = 1;
  });
}
