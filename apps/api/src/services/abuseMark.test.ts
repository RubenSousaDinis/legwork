/**
 * T-30 §8, by name: `markSubjectIsPayer`, `corpusMarkingRule`, `noIdentityLogsOnly`.
 *
 * All three run on `FakeChain` and pglite. The one thing they are really testing is
 * restraint — a mark is a permanent public record against an agent, so the interesting
 * assertions are the ones that count *zero* writes: a claimed id the payer does not own, a
 * cap, a type gate, a schema error and a region miss all leave the chain untouched.
 *
 * `@legwork/screening` (T-06) exports no corpus of its own — `packages/screening/src/index.ts`
 * publishes the pipeline, the gate rules and the place index and nothing else — so the
 * mini-corpus below is the §7-5 table, with the four rows quoted from `10-schemas.md §10`.
 */
import { FakeChain } from '@legwork/chain';
import { ABUSE_CLASSES, ABUSE_CLASS_ID, type AbuseClass } from '@legwork/shared';
import type { Address, Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../test/db';
import {
  MARK_OUTCOME_LABEL,
  isMarkableClass,
  markIfIdentified,
  type MarkResult,
} from './abuseMark';
import type { ChainReader, ServiceDeps } from './identity';
import { listPosters, resetPosterCacheForTests, upsertPoster } from './posters';
import { logScreening } from './screeningLog';

const PAYER = `0x${'a1'.repeat(20)}` as Address;
const OWNER_A = `0x${'aa'.repeat(20)}` as Address;
const WALLET_B = `0x${'bb'.repeat(20)}` as Address;
const AGENT_ID = 1207n;
const CLAIMED = '1207';
const SPEC_HASH = `0x${'11'.repeat(32)}` as Hex;
const OTHER_SPEC_HASH = `0x${'22'.repeat(32)}` as Hex;

/** The class whose id is 5, so the recorded `args` carry a number the brief names. */
const CLASS_5: AbuseClass = 'authentication circumvention';

let test: TestDb;
let fake: FakeChain;
let clock: Date;

function deps(over: Partial<ServiceDeps> = {}): ServiceDeps {
  return { chain: fake, txQueue: fake, db: test.db, now: () => clock, ...over };
}

/**
 * A reader bound to the fake, method by method — `FakeChain`'s reads live on the prototype,
 * so a spread of the instance is an object with none of them on it that still typechecks.
 */
function readerOf(overrides: Partial<ChainReader> = {}): ChainReader {
  return {
    ownerOf: (id) => fake.ownerOf(id),
    getAgentWallet: (id) => fake.getAgentWallet(id),
    marked: (id, hash) => fake.marked(id, hash),
    lastMarkAt: (id) => fake.lastMarkAt(id),
    markCooldown: () => fake.markCooldown(),
    allowlistedBuyer: (buyer) => fake.allowlistedBuyer(buyer),
    now: () => fake.now(),
    ...overrides,
  };
}

const markCalls = () => fake.calls.filter((c) => c.fn === 'mark');
const marksLogRows = () => test.rawQuery('select * from marks_log order by at asc');
const screeningRows = () => test.rawQuery('select * from screening_log order by at asc');

beforeEach(async () => {
  test = await createTestDb();
  fake = new FakeChain();
  clock = new Date('2026-09-07T09:00:00.000Z');
  resetPosterCacheForTests();
});
afterEach(async () => {
  await test.close();
  resetPosterCacheForTests();
});

// ------------------------------------------------------------------------- §8

describe('markSubjectIsPayer', () => {
  it('does not mark an id the payer neither owns nor is the wallet of', async () => {
    fake.setAgentIdentity(AGENT_ID, OWNER_A, WALLET_B);

    const result = await markIfIdentified(CLASS_5, SPEC_HASH, PAYER, CLAIMED, deps());

    expect(result).toEqual({ marked: false, outcome: 'not_owner', agent_id: null });
    expect(fake.calls).toHaveLength(0);

    const rows = await marksLogRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      payer: PAYER,
      agent_id_claimed: CLAIMED,
      agent_id: null,
      class: CLASS_5,
      spec_hash: SPEC_HASH,
      outcome: 'not_owner',
      tx: null,
    });
  });

  it('marks when ownerOf is the payer, once, on the signer key', async () => {
    fake.setAgentIdentity(AGENT_ID, PAYER, WALLET_B);

    const result = await markIfIdentified(CLASS_5, SPEC_HASH, PAYER, CLAIMED, deps());

    expect(markCalls()).toEqual([
      { fn: 'mark', role: 'signer', args: [AGENT_ID, 5, SPEC_HASH] },
    ]);
    expect(result).toMatchObject({ marked: true, agent_id: '1207' });
    const marked = result as Extract<MarkResult, { marked: true }>;
    expect(marked.mark_tx).toMatch(/^0x[0-9a-f]{64}$/);

    const rows = await marksLogRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'marked', agent_id: '1207', tx: marked.mark_tx });
  });

  it('marks when getAgentWallet is the payer and ownerOf is not', async () => {
    fake.setAgentIdentity(AGENT_ID, OWNER_A, PAYER);

    const result = await markIfIdentified(CLASS_5, SPEC_HASH, PAYER, CLAIMED, deps());

    expect(result).toMatchObject({ marked: true, agent_id: '1207' });
    expect(markCalls()).toHaveLength(1);
  });

  it('is already_marked for the same (agentId, specHash), with no second write', async () => {
    fake.setAgentIdentity(AGENT_ID, PAYER, WALLET_B);
    await markIfIdentified(CLASS_5, SPEC_HASH, PAYER, CLAIMED, deps());

    const again = await markIfIdentified(CLASS_5, SPEC_HASH, PAYER, CLAIMED, deps());

    expect(again).toEqual({ marked: false, outcome: 'already_marked', agent_id: '1207' });
    expect(markCalls()).toHaveLength(1);
    const rows = await marksLogRows();
    expect(rows.map((r) => r.outcome)).toEqual(['marked', 'already_marked']);
  });

  it('is cooldown from the pre-check — lastMarkAt + markCooldown() > now — with no write', async () => {
    fake.setAgentIdentity(AGENT_ID, PAYER, WALLET_B);
    await markIfIdentified(CLASS_5, SPEC_HASH, PAYER, CLAIMED, deps());
    expect(markCalls()).toHaveLength(1);

    // A different spec, so the idempotency check passes and the rate limit is what answers.
    const second = await markIfIdentified('referral fraud', OTHER_SPEC_HASH, PAYER, CLAIMED, deps());

    expect(second).toEqual({ marked: false, outcome: 'cooldown', agent_id: '1207' });
    expect(markCalls()).toHaveLength(1);
    expect((await marksLogRows()).map((r) => r.outcome)).toEqual(['marked', 'cooldown']);
  });

  it('marks again once the contract cooldown has elapsed', async () => {
    fake.setAgentIdentity(AGENT_ID, PAYER, WALLET_B);
    await markIfIdentified(CLASS_5, SPEC_HASH, PAYER, CLAIMED, deps());

    // The window is read from the contract, never written here.
    await fake.warp(Number(await fake.markCooldown()) + 1);
    const second = await markIfIdentified('referral fraud', OTHER_SPEC_HASH, PAYER, CLAIMED, deps());

    expect(second).toMatchObject({ marked: true, agent_id: '1207' });
    expect(markCalls()).toHaveLength(2);
  });

  it('is cooldown when the write itself reverts MarkCooldown and the pre-check passed', async () => {
    fake.setAgentIdentity(AGENT_ID, PAYER, WALLET_B);
    expect(await fake.lastMarkAt(AGENT_ID)).toBe(0n); // the pre-check will pass
    fake.failNextWith('MarkCooldown');

    const result = await markIfIdentified(CLASS_5, SPEC_HASH, PAYER, CLAIMED, deps());

    expect(result).toEqual({ marked: false, outcome: 'cooldown', agent_id: '1207' });
    expect(markCalls()).toHaveLength(1); // attempted, reverted, wrote nothing
    expect(await fake.marked(AGENT_ID, SPEC_HASH)).toBe(false);
    expect((await marksLogRows())[0]).toMatchObject({ outcome: 'cooldown', tx: null });
  });

  it('is tx_failed for any other write failure', async () => {
    fake.setAgentIdentity(AGENT_ID, PAYER, WALLET_B);
    const chain = readerOf();
    const deadQueue: ServiceDeps['txQueue'] = {
      mark: async () => {
        throw new Error('replacement transaction underpriced');
      },
    };

    const result = await markIfIdentified(
      CLASS_5,
      SPEC_HASH,
      PAYER,
      CLAIMED,
      deps({ chain, txQueue: deadQueue }),
    );

    expect(result).toEqual({ marked: false, outcome: 'tx_failed', agent_id: '1207' });
    expect((await marksLogRows())[0]).toMatchObject({ outcome: 'tx_failed', tx: null });
  });

  it('renders the cooldown as a fact about our rate limit, not an error', () => {
    expect(MARK_OUTCOME_LABEL.cooldown).toBe('logged, cooldown');
    expect(MARK_OUTCOME_LABEL.marked).toBe('marked');
    expect(MARK_OUTCOME_LABEL.not_owner).toBe('claimed id not owned by payer');
    expect(MARK_OUTCOME_LABEL.no_identity).toBe('no identity');
    expect(MARK_OUTCOME_LABEL.already_marked).toBe('already marked');
    expect(MARK_OUTCOME_LABEL.tx_failed).toBe('mark failed — logged');
    expect(MARK_OUTCOME_LABEL.not_markable).toBe('not a marking class');
  });
});

// ---------------------------------------------------------------- the corpus

/** One screening decision, as `10-schemas.md §10` tabulates it. */
interface CorpusRow {
  /** The row number in §10, where the row has one. */
  n?: number;
  task_type: string;
  /** What the pipeline classified it as. `null` is every refusal that is not one of the six. */
  cls: AbuseClass | null;
  rule_id: string;
  reason: string;
  marks: boolean;
  accepts?: boolean;
}

/** The six, generated from the enum so a typo cannot exist in only one place. */
const SIX_CLASS_ROWS: CorpusRow[] = ABUSE_CLASSES.map((cls) => ({
  task_type: 'verify-open',
  cls,
  rule_id: `classifier.${ABUSE_CLASS_ID[cls]}`,
  reason: `refused as ${cls}`,
  marks: true,
}));

/** The rows §7-5 quotes: a cap, an acceptance, a type gate, a schema error and a region miss. */
const NON_MARKING_ROWS: CorpusRow[] = [
  {
    n: 53,
    task_type: 'verify-open',
    cls: null,
    rule_id: 'cap: maxOpenTasksPerBuyer',
    reason: 'the sixth open task from this buyer',
    marks: false,
  },
  {
    n: 55,
    task_type: 'verify-open',
    cls: null,
    rule_id: 'accept',
    reason: 'accepted',
    marks: false,
    accepts: true,
  },
  {
    n: 56,
    task_type: 'free text',
    cls: null,
    rule_id: 'type gate',
    reason: 'no task type fits; try photo-of with queue_length',
    marks: false,
  },
  {
    task_type: 'verify-open',
    cls: null,
    rule_id: 'schema.spec.place.place_id',
    reason: 'place.place_id is required',
    marks: false,
  },
  {
    task_type: 'verify-open',
    cls: null,
    rule_id: 'region',
    reason: 'that place is outside the demo extract',
    marks: false,
  },
];

describe('corpusMarkingRule', () => {
  it('uses the six labels the enum declares, byte for byte', () => {
    expect(SIX_CLASS_ROWS.map((r) => r.cls)).toEqual(Object.keys(ABUSE_CLASS_ID));
    expect(Object.keys(ABUSE_CLASS_ID)).toEqual([...ABUSE_CLASSES]);
  });

  it('marks every one of the six when the identity verifies', async () => {
    for (const row of SIX_CLASS_ROWS) {
      fake = new FakeChain();
      fake.setAgentIdentity(AGENT_ID, PAYER, WALLET_B);
      const hash = `0x${String(ABUSE_CLASS_ID[row.cls as AbuseClass]).repeat(64).slice(0, 64)}` as Hex;

      const result = await markIfIdentified(row.cls as AbuseClass, hash, PAYER, CLAIMED, deps());

      expect(isMarkableClass(row.cls)).toBe(true);
      expect(result).toMatchObject({ marked: true, agent_id: '1207' });
      expect(markCalls()).toEqual([
        { fn: 'mark', role: 'signer', args: [AGENT_ID, ABUSE_CLASS_ID[row.cls as AbuseClass], hash] },
      ]);
    }
  });

  it('marks none of the six when the payer has no identity', async () => {
    for (const row of SIX_CLASS_ROWS) {
      fake = new FakeChain(); // no `setAgentIdentity`: nobody owns 1207 here
      const result = await markIfIdentified(row.cls as AbuseClass, SPEC_HASH, PAYER, undefined, deps());

      expect(result).toEqual({ marked: false, outcome: 'no_identity', agent_id: null });
      expect(fake.calls).toHaveLength(0);
    }
    // One row per attempt, and never a transaction.
    const rows = await marksLogRows();
    expect(rows).toHaveLength(SIX_CLASS_ROWS.length);
    expect(rows.every((r) => r.outcome === 'no_identity' && r.tx === null)).toBe(true);
  });

  it('never reads, writes or logs for a cap, a type gate, a schema error or a region miss', async () => {
    fake.setAgentIdentity(AGENT_ID, PAYER, WALLET_B); // a verified id, deliberately

    for (const row of NON_MARKING_ROWS) {
      expect(isMarkableClass(row.cls)).toBe(false);

      const result = await markIfIdentified(
        row.cls as unknown as AbuseClass,
        SPEC_HASH,
        PAYER,
        CLAIMED,
        deps(),
      );

      expect(result).toEqual({ marked: false, outcome: 'not_markable', agent_id: null });
    }

    expect(fake.calls).toHaveLength(0);
    expect(await marksLogRows()).toHaveLength(0);
  });

  it('row 55 accepts: an accepted screening row with no id, and a poster', async () => {
    const row = NON_MARKING_ROWS.find((r) => r.n === 55);
    expect(row?.accepts).toBe(true);

    // "identity is not required to hire, only to be marked" — no `setAgentIdentity` here.
    await logScreening(
      {
        task_type: row!.task_type,
        class: null,
        reason: row!.reason,
        rule_id: row!.rule_id,
        spec_hash: SPEC_HASH,
        marked: false,
        mark_tx: null,
        agent_id: null,
        payer: PAYER,
      },
      deps(),
    );
    await upsertPoster({ payer: PAYER, agentId: null }, deps());

    const [logged] = await screeningRows();
    expect(logged).toMatchObject({
      class: null,
      reason: 'accepted',
      rule_id: 'accept',
      marked: false,
      agent_id: null,
      mark_tx: null,
    });

    const list = await listPosters(deps());
    expect(list.posters).toEqual([
      { payer: PAYER, agent_id: null, first_seen: clock, allowlisted: false },
    ]);
    expect(list.distinct_external_buyers).toBe(1);
    expect(await marksLogRows()).toHaveLength(0);
  });
});

// ------------------------------------------------------------------- no identity

describe('noIdentityLogsOnly', () => {
  /** The words the decision was about. They must reach no column of either table. */
  const SPEC_TEXT = 'SENTINEL-VICTIM-4f2a: obtain the password for that mailbox and photograph it';

  it('claims nothing, reads nothing and writes nothing, but leaves one row', async () => {
    let ownerOfReads = 0;
    const chain = readerOf({
      ownerOf: async (id: bigint) => {
        ownerOfReads += 1;
        return fake.ownerOf(id);
      },
    });

    const result = await markIfIdentified(CLASS_5, SPEC_HASH, PAYER, undefined, deps({ chain }));

    expect(result).toEqual({ marked: false, outcome: 'no_identity', agent_id: null });
    expect(ownerOfReads).toBe(0); // there is no reverse lookup; a payer that claims nothing has nothing
    expect(fake.calls).toHaveLength(0);

    const rows = await marksLogRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      payer: PAYER,
      agent_id_claimed: null,
      agent_id: null,
      class: CLASS_5,
      spec_hash: SPEC_HASH,
      outcome: 'no_identity',
      tx: null,
    });
    expect(MARK_OUTCOME_LABEL.no_identity).toBe('no identity');
  });

  it('logs the matching screening row with the hash and none of the words', async () => {
    await markIfIdentified(CLASS_5, SPEC_HASH, PAYER, undefined, deps());
    await logScreening(
      {
        task_type: 'verify-open',
        class: CLASS_5,
        reason: 'asks us to get past a login that is not the requester own',
        rule_id: 'classifier.5',
        spec_hash: SPEC_HASH,
        marked: false,
        mark_tx: null,
        agent_id: null,
        payer: PAYER,
      },
      deps(),
    );

    const [row] = await screeningRows();
    expect(row).toMatchObject({
      marked: false,
      mark_tx: null,
      agent_id: null,
      spec_hash: SPEC_HASH,
      class: CLASS_5,
    });

    const written = JSON.stringify([row, ...(await marksLogRows())]);
    for (const word of SPEC_TEXT.split(' ').filter((w) => w.length > 4)) {
      expect(written).not.toContain(word);
    }
  });

  it('throws on a reason holding a brace and inserts nothing', async () => {
    await expect(
      logScreening(
        {
          task_type: 'verify-open',
          class: CLASS_5,
          reason: `{"spec": "${SPEC_TEXT}"}`,
          rule_id: 'classifier.5',
          spec_hash: SPEC_HASH,
          marked: false,
          mark_tx: null,
          agent_id: null,
          payer: PAYER,
        },
        deps(),
      ),
    ).rejects.toThrow('screening_log.reason must be the gate sentence, not spec text');

    expect(await screeningRows()).toHaveLength(0);
  });
});

// ------------------------------------------ the hire.ts object shape (lead handover)

describe('markIfIdentified (hire.ts object shape)', () => {
  it('marks a verified id on the signer key and records the claim', async () => {
    fake.setAgentIdentity(AGENT_ID, PAYER, WALLET_B);

    const result = await markIfIdentified(
      { agentId: AGENT_ID, verified: true, classId: 5, specHash: SPEC_HASH, payer: PAYER, claimed: CLAIMED },
      deps(),
    );

    expect(result.marked).toBe(true);
    expect(markCalls()).toEqual([{ fn: 'mark', role: 'signer', args: [AGENT_ID, 5, SPEC_HASH] }]);
    const rows = await marksLogRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'marked', agent_id: '1207', agent_id_claimed: '1207' });
  });

  it('logs no_identity for an unverified caller, with the claim, without a read or a write', async () => {
    const result = await markIfIdentified(
      { agentId: 0n, verified: false, classId: 5, specHash: SPEC_HASH, payer: PAYER, claimed: '9' },
      deps(),
    );

    expect(result).toEqual({ marked: false });
    expect(fake.calls).toHaveLength(0);
    const rows = await marksLogRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'no_identity', agent_id: null, agent_id_claimed: '9' });
  });

  it('is not_markable outside the six, with no row', async () => {
    const result = await markIfIdentified(
      { agentId: AGENT_ID, verified: true, classId: 7, specHash: SPEC_HASH, payer: PAYER },
      deps(),
    );

    expect(result).toEqual({ marked: false });
    expect(fake.calls).toHaveLength(0);
    expect(await marksLogRows()).toHaveLength(0);
  });
});
