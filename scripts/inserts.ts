/**
 * The two terminal inserts, one at a time, full screen.
 *
 *   pnpm --silent --filter scripts inserts -- --insert hire|refusal [--width 80] [--hold 3]
 *   pnpm --silent --filter scripts inserts -- --print-checklist
 *   pnpm --silent --filter scripts inserts -- --print-captions
 *
 * The video shows the terminal twice, for three seconds each, and never as a persistent pane.
 * So this script owns the whole screen for those three seconds and puts nothing on it but the
 * insert: no prompt, no path, no URL, no key, no colour. The operator sets the theme and the
 * font size; the script only pads and wraps.
 *
 * Nothing here is typed from the storyboard. Both blocks are lifted out of `examples/transcript.md`
 * (T-34) between its `insert:<name>` markers, and those are copies of what really came back —
 * the hire lines are the local MCP binary's `LEGWORK_INSERT=1` stderr (T-28) minus the trailing
 * dashboard URL. Where the storyboard and the transcript disagree, the transcript wins: the
 * created task answers `201 { task_id: … }`, not the storyboard's `200 {taskId}`.
 *
 * **`--width` is a rendering width, never a rejection rule** (lead ruling, Sept 8, §15). A block
 * is always three *logical* lines; a logical line longer than the width is soft-wrapped for
 * display and its continuations carry a further two-space hanging indent. The refusal payload is
 * 183 characters and cannot be shortened without dropping the class or the no-retry sentence that
 * §8 and §10 require, and the transcript is a record of a real run, never edited to fit a
 * terminal. Wrapping is what a terminal does with a long line, and at 28 pt a wrapped payload
 * reads — a rejected insert does not exist at all.
 *
 * What the validator still refuses is what must never reach a published frame: a URL, a
 * 64-character hex string, an Anthropic key, a live `buyer_token`, or a block that is not three
 * logical lines. Those are checked before the screen is cleared, and a failure prints
 * `INSERT INVALID: <reason>` and exits 1 without drawing anything.
 */
import { readFileSync } from 'node:fs';

/** The two marked blocks, and the only two things `--insert` accepts. */
export const INSERT_NAMES = ['hire', 'refusal'] as const;
export type InsertName = (typeof INSERT_NAMES)[number];

/** Every insert is three logical lines. Two would not be the shape the video cuts to. */
export const INSERT_LINES = 3;

/** Columns the rendered card may occupy. `--width` overrides it. */
export const DEFAULT_WIDTH = 80;

/** Seconds the insert stays on screen. The cut is three seconds long. */
export const DEFAULT_HOLD_S = 3;

/** Blank lines above and below the block. */
export const PAD_LINES = 2;

/** Left margin on every rendered line, in spaces. */
export const MARGIN = '  ';

/** Added again on a continuation line, so a wrap reads as one logical line, not as a fourth. */
export const HANGING_INDENT = '  ';

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
 * as logical lines, fences dropped. Nothing is trimmed, reflowed or filtered: a stray blank
 * line inside the block is a fourth logical line and the validator says so, rather than being
 * silently swallowed here and surprising the operator on camera.
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

/** Characters, not bytes: `·`, `→`, `…` and `á` each take one column in a monospace terminal. */
export function widthOf(line: string): number {
  return [...line].length;
}

/**
 * Everything that must be true before the screen is cleared. Length is deliberately not among
 * them — a long line wraps (§15). Returns the lines so a caller can chain; throws
 * `InsertInvalid` with the reason the operator needs, naming the line.
 */
export function validateInsert(lines: string[]): string[] {
  if (lines.length !== INSERT_LINES) {
    throw new InsertInvalid(`expected ${INSERT_LINES} logical lines, got ${lines.length}`);
  }

  lines.forEach((line, index) => {
    const at = `line ${index + 1}`;
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
export function loadInsert(name: InsertName): string[] {
  return validateInsert(extractInsert(readTranscript(), name));
}

// ------------------------------------------------------------------ the wrapper

/**
 * True for the refusal payload. A JSON object breaks after a comma rather than at whichever
 * space happens to fall near the limit, so a key and its value stay together and the reader's
 * eye lands on a field boundary.
 */
export function isPayloadLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}');
}

/** Last index in `units` at or before `limit` where `predicate` holds, or -1. */
function lastBreakAt(
  units: readonly string[],
  limit: number,
  predicate: (unit: string) => boolean,
): number {
  for (let i = Math.min(limit, units.length) - 1; i > 0; i -= 1) {
    if (predicate(units[i] as string)) return i;
  }
  return -1;
}

/**
 * One logical line as the segments it occupies on screen — content only, margins added later.
 * A line that fits comes back as a single segment, which is every line of the hire insert.
 *
 * `first` and `rest` are the columns available before and after the hanging indent eats two of
 * them, so the caller can hand this the real budgets rather than the raw terminal width.
 */
export function wrapLogicalLine(line: string, first: number, rest: number): string[] {
  const headroom = Math.max(1, first);
  const tail = Math.max(1, rest);
  const byComma = isPayloadLine(line);

  const segments: string[] = [];
  let units = [...line];
  let limit = headroom;

  while (units.length > limit) {
    // Break *after* a comma, but *before* a space — the comma belongs to the segment it ends,
    // the space belongs to neither and is dropped.
    const comma = byComma ? lastBreakAt(units, limit + 1, (u) => u === ',') + 1 : 0;
    const space = lastBreakAt(units, limit + 1, (u) => u === ' ');
    // A single unbroken token longer than the limit has no break point: cut at the limit rather
    // than let it run off the frame.
    const cut = comma > 0 ? comma : space > 0 ? space : limit;

    segments.push(units.slice(0, cut).join('').trimEnd());
    units = units.slice(cut);
    while (units[0] === ' ') units = units.slice(1);
    limit = tail;
  }
  segments.push(units.join(''));

  return segments;
}

// ----------------------------------------------------------------- the printer

/**
 * The block as it reaches the screen: two blank lines, the logical lines behind a two-space
 * margin with each continuation indented two further spaces, two blank lines. No rendered line
 * exceeds `width`. No colour codes — the operator's theme is the only styling.
 */
export function renderLines(lines: string[], width: number = DEFAULT_WIDTH): string[] {
  const first = width - widthOf(MARGIN);
  const rest = first - widthOf(HANGING_INDENT);

  const body = lines.flatMap((line) =>
    wrapLogicalLine(line, first, rest).map(
      (segment, index) => `${MARGIN}${index === 0 ? '' : HANGING_INDENT}${segment}`,
    ),
  );
  const blank = Array<string>(PAD_LINES).fill('');

  return [...blank, ...body, ...blank];
}

export function renderInsert(lines: string[], width: number = DEFAULT_WIDTH): string {
  return renderLines(lines, width).join('\n');
}

/** Clear and home. Sent only to a TTY: piped output is read as text, not watched. */
export const CLEAR = '\x1b[2J\x1b[H';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

const sleep = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

export async function showInsert(
  lines: string[],
  { hold, tty, width }: { hold: number; tty: boolean; width: number },
): Promise<void> {
  if (tty) process.stdout.write(CLEAR + HIDE_CURSOR);
  process.stdout.write(`${renderInsert(lines, width)}\n`);
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
  await showInsert(loadInsert(options.insert), {
    hold: options.hold ?? (tty ? DEFAULT_HOLD_S : 0),
    tty,
    width: options.width,
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
