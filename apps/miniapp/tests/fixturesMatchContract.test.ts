import { API_ROUTES } from '@legwork/shared';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { RESPONSE_FIXTURES } from '../mocks/handlers';

/**
 * A mock that has drifted from the contract is worse than no mock: three tasks build against
 * it. Every fixture the handlers can answer with is parsed here with the very schema the API
 * declares for that route and status.
 */
describe('mocks', () => {
  it('fixturesMatchContract', () => {
    expect(RESPONSE_FIXTURES.length).toBeGreaterThan(0);

    for (const { route, status, body } of RESPONSE_FIXTURES) {
      // Each route declares its own status keys, so the cross-product needs a widened index.
      const responses = API_ROUTES[route].responses as Record<number, z.ZodType | undefined>;
      const schema = responses[status];
      expect(schema, `${route} declares no ${status} response`).toBeDefined();

      const parsed = schema?.safeParse(body);
      expect(
        parsed?.success,
        `${route} ${status}: ${JSON.stringify(parsed?.error?.issues ?? [])}`,
      ).toBe(true);
    }
  });
});
