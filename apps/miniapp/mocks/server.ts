import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { handlers, resetLastVerifyBody } from './handlers';
import { resetScenarios } from './scenarios';

/**
 * The vitest setup file. Every request a test makes is answered here; an unhandled one is an
 * error, so nothing can quietly reach a live World endpoint from CI.
 */
export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  resetLastVerifyBody();
  resetScenarios();
});
afterAll(() => server.close());
