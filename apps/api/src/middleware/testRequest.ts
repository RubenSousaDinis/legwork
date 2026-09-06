/**
 * Vitest helper: a `NextRequest` on this API's origin, with the headers a test cares about
 * and nothing else. The guards read `nextUrl.pathname`, the method and a handful of headers,
 * so this is the whole of what a test has to build.
 */
import { NextRequest } from 'next/server';

export const TEST_ORIGIN = 'https://api.legwork.test';

export interface TestRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
}

export function request(path: string, init: TestRequestInit = {}): NextRequest {
  const { method = 'GET', headers = {}, body } = init;
  return new NextRequest(`${TEST_ORIGIN}${path}`, { method, headers, body: body ?? undefined });
}
