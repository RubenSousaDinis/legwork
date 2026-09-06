import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import feed from './feed.json';
import outcomes from './outcomes.json';
import posters from './posters.json';
import preflight from './preflight.json';
import marks0 from './marks-0.json';
import marks1 from './marks-1.json';
import refusals0 from './refusals-0.json';
import refusals1 from './refusals-1.json';
import pool from './workers.json';

/**
 * Test-only scaffolding, beside the recorded responses it serves. Nothing in the app
 * imports this file, so `msw` never reaches a bundle.
 *
 * `onUnhandledRequest: 'error'` is the point of it: a request no handler below
 * describes is a test reaching for the real network, and it fails loudly rather than
 * hanging. No live model, no live chain, no live facilitator — recorded JSON only.
 */

export const ORIGIN = 'http://localhost:3000';
export const SUBGRAPH_URL = 'https://subgraph.test/legwork';

/** A fixed `Date` header, so `generatedAt` is stable and two polls can be compared. */
export const FEED_DATE = 'Sat, 05 Sep 2026 10:53:00 GMT';

export function feedHandler() {
  return http.get(`${ORIGIN}/api/public/feed`, () =>
    HttpResponse.json(feed, { headers: { date: FEED_DATE } }),
  );
}

export function refusalsHandler(body: Record<string, unknown>) {
  return http.get(`${ORIGIN}/api/public/refusals`, () => HttpResponse.json(body));
}

export function postersHandler() {
  return http.get(`${ORIGIN}/api/public/posters`, () => HttpResponse.json(posters));
}

export function preflightHandler() {
  return http.get(`${ORIGIN}/api/public/preflight`, () => HttpResponse.json(preflight));
}

/**
 * One endpoint, two documents: the pool round trip, and the agent's paid outcomes and
 * marks. `marksBody` is what `markCounterAnimates` swaps — the mark counter is fed by
 * the `Mark` entity, not by the public refusals feed.
 */
export function subgraphHandler(marksBody: Record<string, unknown> = marks0) {
  return http.post(SUBGRAPH_URL, async ({ request }) => {
    const body = (await request.json()) as { query: string };
    if (body.query.includes('query Agent')) {
      return HttpResponse.json({ data: { ...outcomes, ...marksBody } });
    }
    return HttpResponse.json({ data: pool });
  });
}

export function liveHandlers(
  refusalsBody: Record<string, unknown> = refusals0,
  marksBody: Record<string, unknown> = marks0,
) {
  return [
    feedHandler(),
    refusalsHandler(refusalsBody),
    postersHandler(),
    preflightHandler(),
    subgraphHandler(marksBody),
  ];
}

/** Every source refusing, so the adapter's zero/empty path can be tested honestly. */
export function downHandlers() {
  return [
    http.get(`${ORIGIN}/api/public/feed`, () => new HttpResponse(null, { status: 503 })),
    http.get(`${ORIGIN}/api/public/refusals`, () => new HttpResponse(null, { status: 503 })),
    http.get(`${ORIGIN}/api/public/posters`, () => new HttpResponse(null, { status: 503 })),
    http.get(`${ORIGIN}/api/public/preflight`, () => new HttpResponse(null, { status: 503 })),
    http.post(SUBGRAPH_URL, () => new HttpResponse(null, { status: 503 })),
  ];
}

export function liveServer() {
  return setupServer(...liveHandlers());
}

export const fixtures = {
  feed,
  posters,
  preflight,
  refusals0,
  refusals1,
  outcomes,
  marks0,
  marks1,
  pool,
};
