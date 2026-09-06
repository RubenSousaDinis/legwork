import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/api';
import { verifyProof } from '../lib/worldid';
import { lastVerifyBody, nullifierAlreadyRegistered } from '../mocks/handlers';
import { server } from '../mocks/server';
import { IDKIT_RESULT_FIXTURE } from './fixtures';

describe('probe', () => {
  it('probeIdkitFlowAgainstMsw', async () => {
    // Forwarded as-is: the bytes on the wire are exactly the object verifyProof was handed.
    await verifyProof(IDKIT_RESULT_FIXTURE);
    expect(lastVerifyBody()).toBe(JSON.stringify(IDKIT_RESULT_FIXTURE));

    // One person, one worker account: the second registration is a 409, not a crash.
    server.use(nullifierAlreadyRegistered);
    const error = await verifyProof(IDKIT_RESULT_FIXTURE).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).body).toEqual({ error: 'nullifier_already_registered' });
    expect(((error as ApiError).body as { error: string }).error).toBe(
      'nullifier_already_registered',
    );
    expect(lastVerifyBody()).toBe(JSON.stringify(IDKIT_RESULT_FIXTURE));
  });
});
