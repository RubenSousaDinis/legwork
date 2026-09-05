/**
 * The disclosed operator powers, and the ledger that makes them disclosable.
 *
 * The interesting assertions are the negative ones: an unset key means the whole group is a
 * 404, a wrong key writes no audit row, and no audit row ever contains the key itself.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeChain, type ChainAdapter } from '@legwork/chain';
import { POST as pause } from '../../app/admin/pause/route';
import { POST as unpause } from '../../app/admin/unpause/route';
import { POST as resolve } from '../../app/admin/resolve/route';
import { POST as resetDemo } from '../../app/admin/reset-demo/route';
import { POST as resetWorker } from '../../app/admin/reset-worker/route';
import { POST as seedDemo } from '../../app/admin/seed-demo/route';
import { resetConfigForTests } from '../../src/config';
import { setChainForTests } from '../../src/chain';
import { resetRateLimitForTests } from '../../src/http/rateLimit';
import { nullifiers, tasks } from '../../src/db/schema';
import { hashBuyerToken } from '../../src/services/buyerToken';
import { call } from '../app';
import { createTestDb, type TestDb } from '../db';

// --------------------------------------------------------------- chain double

/**
 * `FakeChain` has no call log, so this recorder wraps one: reads fall through, writes are
 * recorded and answered with a synthetic hash. `role` mirrors
 * `packages/chain/src/contracts/{escrow,registry}.ts` — and `owner` there *is* the deployer
 * key (`DEPLOYER_PRIVATE_KEY` → `clients.wallets.owner`), which is the role the brief names.
 */
const WRITE_ROLE: Record<string, 'relayer' | 'signer' | 'owner'> = {
  post: 'relayer', claimFor: 'relayer', releaseClaimFor: 'relayer', submitFor: 'relayer',
  approve: 'relayer', dispute: 'relayer', autoRelease: 'relayer', expire: 'relayer',
  registerFor: 'relayer', mark: 'signer',
  pause: 'owner', unpause: 'owner', resolve: 'owner', resetWorker: 'owner',
  setAllowlistedBuyer: 'owner', seedWorker: 'owner', setMarkCooldown: 'owner',
};

interface RecordedCall {
  fn: string;
  args: unknown[];
  role: 'relayer' | 'signer' | 'owner';
}

class RecordingChain {
  readonly calls: RecordedCall[] = [];
  readonly adapter: ChainAdapter;
  private sent = 0;

  constructor() {
    const fake = new FakeChain();
    this.adapter = new Proxy(fake, {
      get: (target, prop, receiver) => {
        const fn = String(prop);
        const role = WRITE_ROLE[fn];
        if (!role) return Reflect.get(target, prop, receiver);
        return async (...args: unknown[]) => {
          this.calls.push({ fn, args, role });
          this.sent += 1;
          return { hash: hashOf(this.sent), blockNumber: 1n, events: [] };
        };
      },
    }) as unknown as ChainAdapter;
  }
}

const hashOf = (n: number): `0x${string}` => `0x${n.toString(16).padStart(64, '0')}`;

// -------------------------------------------------------------------- fixture

const ADMIN_KEY = 'an-admin-key-only-the-operator-holds';

interface AuditRow {
  action: string;
  payload: { route: string; outcome: string; body: Record<string, unknown> };
  tx: string | null;
}

let fixture: TestDb;
let chain: RecordingChain;

const audit = async (): Promise<AuditRow[]> =>
  (await fixture.rawQuery(
    'SELECT action, payload, tx FROM admin_audit ORDER BY at',
  )) as unknown as AuditRow[];

async function seedDisputedTask(): Promise<void> {
  const postedAt = new Date(Date.now() - 600_000);
  await fixture.db.insert(tasks).values({
    taskId: 1n,
    taskType: 1,
    specHash: hashOf(7),
    amountUnits: 3_000_000n,
    feeUnits: 450_000n,
    priceUnits: 3_450_000n,
    buyer: `0x${'b1'.repeat(20)}`,
    area: 'ez1dp',
    worker: `0x${'c1'.repeat(20)}`,
    state: 'disputed',
    postedAt,
    claimedAt: new Date(postedAt.getTime() + 60_000),
    submittedAt: new Date(postedAt.getTime() + 300_000),
    claimTtlS: 1800,
    submitTtlS: 3600,
    disputeWindowS: 120,
    txPost: hashOf(1),
    specJson: { place: 'private' },
    buyerTokenHash: hashBuyerToken('a-buyer-token'),
    payer: `0x${'a1'.repeat(20)}`,
  });
}

const withKey = { 'x-admin-key': ADMIN_KEY };

beforeEach(async () => {
  resetConfigForTests({ ADMIN_API_KEY: ADMIN_KEY, DASHBOARD_URL: 'https://dashboard.legwork.test' });
  resetRateLimitForTests();
  chain = new RecordingChain();
  setChainForTests(chain.adapter);
  fixture = await createTestDb();
});

afterEach(async () => {
  setChainForTests(undefined);
  await fixture.close();
});

describe('/admin/*', () => {
  it('adminAuditLogged', async () => {
    const paused = await call(pause, { method: 'POST', headers: withKey });
    expect(paused.status).toBe(200);
    expect(await paused.json()).toEqual({ ok: true, tx: hashOf(1) });
    expect(chain.calls).toEqual([{ fn: 'pause', args: [], role: 'owner' }]);

    const afterPause = await audit();
    expect(afterPause).toHaveLength(1);
    expect(afterPause[0]?.payload.route).toBe('/admin/pause');
    expect(afterPause[0]?.payload.outcome).toBe('ok');
    expect(afterPause[0]?.tx).toBe(hashOf(1));
    expect(JSON.stringify(afterPause[0])).not.toContain(ADMIN_KEY);

    // A wrong key gets the same 401 the frozen contract promises, moves nothing, and — the
    // point of putting the guard before the insert — leaves no row a stranger authored.
    const wrong = await call(pause, { method: 'POST', headers: { 'x-admin-key': 'not-the-key' } });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'unauthorized' });
    expect(chain.calls).toHaveLength(1);
    expect(await audit()).toHaveLength(1);

    await seedDisputedTask();
    const resolved = await call(resolve, {
      method: 'POST',
      headers: withKey,
      body: { task_id: 1, to_buyer: true },
    });
    expect(resolved.status).toBe(200);
    expect(chain.calls.at(-1)).toEqual({ fn: 'resolve', args: [1n, true], role: 'owner' });

    const [row] = await fixture.rawQuery('SELECT state, tx_release FROM tasks WHERE task_id = 1');
    expect(row?.state).toBe('resolved');
    expect(row?.tx_release).toBe(hashOf(2));

    const rows = await audit();
    expect(rows).toHaveLength(2);
    expect(rows[1]?.payload.route).toBe('/admin/resolve');
    expect(rows[1]?.payload.body.task_id).toBe(1);
    expect(rows[1]?.payload.outcome).toBe('ok');
    expect(JSON.stringify(rows[1])).not.toContain(ADMIN_KEY);

    // A new instance with no ADMIN_API_KEY: the group does not exist, and says so.
    resetConfigForTests({ DASHBOARD_URL: 'https://dashboard.legwork.test' });
    const offPause = await call(pause, { method: 'POST', headers: withKey });
    expect(offPause.status).toBe(404);
    expect(await offPause.json()).toEqual({ error: 'not_found' });

    const offResolve = await call(resolve, {
      method: 'POST',
      headers: withKey,
      body: { task_id: 1, to_buyer: true },
    });
    expect(offResolve.status).toBe(404);
    expect(await offResolve.json()).toEqual({ error: 'not_found' });
  });

  it('resolve refuses a task that is not disputed, and unpause is the owner too', async () => {
    await seedDisputedTask();
    await fixture.db.delete(tasks);

    const missing = await call(resolve, {
      method: 'POST',
      headers: withKey,
      body: { task_id: 1, to_buyer: false },
    });
    expect(missing.status).toBe(404);

    await seedDisputedTask();
    await fixture.rawQuery("UPDATE tasks SET state = 'submitted' WHERE task_id = 1");
    const badState = await call(resolve, {
      method: 'POST',
      headers: withKey,
      body: { task_id: 1, to_buyer: false },
    });
    expect(badState.status).toBe(409);
    expect(await badState.json()).toEqual({ error: 'bad_state', status: 'submitted' });
    // The audit row still exists, and it records that the call did not succeed.
    expect((await audit()).at(-1)?.payload.outcome).toBe('error');

    const up = await call(unpause, { method: 'POST', headers: withKey });
    expect(up.status).toBe(200);
    expect(chain.calls.at(-1)).toMatchObject({ fn: 'unpause', role: 'owner' });
  });

  it('reset-demo needs the words, keeps the audit log, and seed-demo is idempotent', async () => {
    await seedDisputedTask();
    await fixture.db.insert(nullifiers).values({
      nullifier: '4242', action: 'legwork-worker', worker: `0x${'c1'.repeat(20)}`,
    });

    const unconfirmed = await call(resetDemo, { method: 'POST', headers: withKey, body: {} });
    expect(unconfirmed.status).toBe(400);
    const [stillThere] = await fixture.rawQuery('SELECT count(*)::int AS n FROM tasks');
    expect(stillThere?.n).toBe(1);

    const confirmed = await call(resetDemo, {
      method: 'POST',
      headers: withKey,
      body: { confirm: 'reset-demo' },
    });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({ ok: true });

    const [gone] = await fixture.rawQuery('SELECT count(*)::int AS n FROM tasks');
    expect(gone?.n).toBe(0);
    // Kept: one human's registration is not demo state, and an erasable audit log is not one.
    const [kept] = await fixture.rawQuery('SELECT count(*)::int AS n FROM nullifiers');
    expect(kept?.n).toBe(1);
    expect((await audit()).length).toBeGreaterThan(0);

    const first = await call(seedDemo, { method: 'POST', headers: withKey });
    expect(await first.json()).toEqual({ ok: true, inserted: 3 });
    const second = await call(seedDemo, { method: 'POST', headers: withKey });
    expect(await second.json()).toEqual({ ok: true, inserted: 0 });

    const seeded = await fixture.rawQuery('SELECT seeded, tx_post FROM tasks ORDER BY task_id');
    expect(seeded).toHaveLength(3);
    expect(seeded.every((r) => r.seeded === true)).toBe(true);
    expect(seeded.every((r) => r.tx_post === '0x8f2a…c41d')).toBe(true);
  });

  it('reset-worker drops the binding after the registry call, not before', async () => {
    await fixture.db.insert(nullifiers).values({
      nullifier: '4242', action: 'legwork-worker', worker: `0x${'c1'.repeat(20)}`,
    });

    const res = await call(resetWorker, {
      method: 'POST',
      headers: withKey,
      body: { nullifier: '0x1092' },
    });
    expect(res.status).toBe(200);
    expect(chain.calls.at(-1)).toEqual({ fn: 'resetWorker', args: [4242n], role: 'owner' });

    const [left] = await fixture.rawQuery('SELECT count(*)::int AS n FROM nullifiers');
    expect(left?.n).toBe(0);
  });
});
