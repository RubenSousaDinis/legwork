/**
 * T-30 §7-3: `logScreening` over pglite, against the real migration.
 *
 * The assertion that matters is the negative one: the row is searched for any substring of
 * the spec text the decision was made about. A field-by-field check passes on a row that
 * also carries the spec in `reason`, and `screening_log` is what `/public/refusals` and the
 * dashboard read.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../test/db';
import type { ServiceDeps } from './identity';
import { ACCEPTED_REASON, ACCEPTED_RULE_ID, logScreening, type ScreeningEntry } from './screeningLog';

const PAYER = `0x${'a1'.repeat(20)}`;
const SPEC_HASH = `0x${'11'.repeat(32)}`;
const AT = new Date('2026-09-07T09:00:00.000Z');

/** The words a caller might carelessly pass through. They must reach no column. */
const SPEC_TEXT = 'SENTINEL-VICTIM-4f2a: obtain the password for that mailbox and photograph it';

let test: TestDb;

function deps(): ServiceDeps {
  return {
    chain: {} as ServiceDeps['chain'],
    txQueue: {} as ServiceDeps['txQueue'],
    db: test.db,
    now: () => AT,
  };
}

const entry = (over: Partial<ScreeningEntry> = {}): ScreeningEntry => ({
  task_type: 'verify-open',
  class: 'credential fraud',
  reason: 'requests access belonging to a third party',
  rule_id: 'classifier.credential-fraud',
  spec_hash: SPEC_HASH,
  marked: false,
  mark_tx: null,
  agent_id: null,
  payer: PAYER,
  ...over,
});

const rows = () => test.rawQuery('select * from screening_log order by at asc');

/** pglite hands back the timestamp as text; the column is `timestamptz`. */
const atOf = (row: Record<string, unknown> | undefined) => new Date(String(row?.at));

beforeEach(async () => {
  test = await createTestDb();
});
afterEach(async () => {
  await test.close();
});

describe('logScreening', () => {
  it('writes one row per decision with the hash and never the words', async () => {
    await logScreening(entry({ marked: true, mark_tx: `0x${'ee'.repeat(32)}`, agent_id: '1207' }), deps());

    const [row] = await rows();
    expect(row).toMatchObject({
      task_type: 'verify-open',
      class: 'credential fraud',
      rule_id: 'classifier.credential-fraud',
      spec_hash: SPEC_HASH,
      marked: true,
      mark_tx: `0x${'ee'.repeat(32)}`,
      agent_id: '1207',
      payer: PAYER,
    });
    expect(atOf(row)).toEqual(AT);

    const text = JSON.stringify(row);
    for (const word of SPEC_TEXT.split(' ').filter((w) => w.length > 4)) {
      expect(text).not.toContain(word);
    }
  });

  it('accepts a null payer — POST /check has none', async () => {
    await logScreening(entry({ payer: null, class: null, reason: 'accepted', rule_id: 'accept' }), deps());
    const [row] = await rows();
    expect(row).toMatchObject({ payer: null, class: null, reason: 'accepted', rule_id: 'accept' });
  });

  it('logs an accepted decision as class null / accepted / accept / not marked', async () => {
    await logScreening(
      entry({ class: null, reason: ACCEPTED_REASON, rule_id: ACCEPTED_RULE_ID, marked: false }),
      deps(),
    );
    const [row] = await rows();
    expect(row).toMatchObject({ class: null, reason: 'accepted', rule_id: 'accept', marked: false });
    expect(ACCEPTED_REASON).toBe('accepted');
    expect(ACCEPTED_RULE_ID).toBe('accept');
  });

  it('defaults `at` to the clock in deps', async () => {
    await logScreening(entry(), deps());
    const [row] = await rows();
    expect(atOf(row)).toEqual(AT);
  });

  it('throws and writes nothing when `reason` looks like spec text', async () => {
    const guard = 'screening_log.reason must be the gate sentence, not spec text';

    for (const reason of [SPEC_TEXT + '\n' + SPEC_TEXT, `{"spec": "${SPEC_TEXT}"}`, 'x'.repeat(201)]) {
      await expect(logScreening(entry({ reason }), deps())).rejects.toThrow(TypeError);
      await expect(logScreening(entry({ reason }), deps())).rejects.toThrow(guard);
    }

    expect(await rows()).toHaveLength(0);
  });

  it('allows a 200-character single-line sentence', async () => {
    await logScreening(entry({ reason: 'x'.repeat(200) }), deps());
    expect(await rows()).toHaveLength(1);
  });
});
