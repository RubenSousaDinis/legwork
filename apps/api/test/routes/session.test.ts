/**
 * `POST /session/logout` and the sliding worker-session TTL.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as sessionGet } from '../../app/session/route';
import { POST as logoutRoute } from '../../app/session/logout/route';
import { resetConfigForTests } from '../../src/config';
import { issueWorkerSession, WORKER_TTL_S } from '../../src/session';
import { call, setCookies } from '../app';
import { createTestDb, type TestDb } from '../db';

const WORKER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const NULLIFIER = '1001';

let fixture: TestDb;

beforeEach(async () => {
  resetConfigForTests();
  fixture = await createTestDb();
});

afterEach(async () => {
  await fixture.close();
});

describe('POST /session/logout', () => {
  it('logoutClearsTheCookieServerSide', async () => {
    const issued = await issueWorkerSession({
      worker: WORKER,
      nullifier: NULLIFIER,
      mode: 'walletAuth',
    });
    const before = await fixture.rawQuery('SELECT id FROM sessions WHERE worker = $1', [WORKER]);
    expect(before.length).toBe(1);

    const res = await call(logoutRoute, {
      method: 'POST',
      url: 'http://localhost/session/logout',
      cookies: { lw_worker: issued.token },
    });

    expect(res.status).toBe(204);
    expect(setCookies(res).lw_worker).toBe('');
    expect(res.headers.getSetCookie().some((cookie) => cookie.includes('Max-Age=0'))).toBe(true);

    const after = await fixture.rawQuery('SELECT id FROM sessions WHERE worker = $1', [WORKER]);
    expect(after).toEqual([]);

    const unauth = await call(logoutRoute, {
      method: 'POST',
      url: 'http://localhost/session/logout',
    });
    expect(unauth.status).toBe(401);
  });
});

describe('worker session TTL', () => {
  it('sessionOutlastsTwelveHours', async () => {
    expect(WORKER_TTL_S).toBe(30 * 86_400);

    const issued = await issueWorkerSession({
      worker: WORKER,
      nullifier: NULLIFIER,
      mode: 'walletAuth',
    });
    expect(issued.cookie).toContain(`Max-Age=${WORKER_TTL_S}`);

    const res = await call(sessionGet, {
      url: 'http://localhost/session',
      headers: { authorization: `Bearer ${issued.token}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((cookie) => cookie.includes(`Max-Age=${WORKER_TTL_S}`))).toBe(
      true,
    );
  });
});
