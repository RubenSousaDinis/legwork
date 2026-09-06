import { render, type RenderResult } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Suspense, type ComponentType } from 'react';
import { server } from '../../mocks/server';

/**
 * What the optional screens need on top of T-24's mocks: the three routes the shared handlers
 * do not log, and a way to render a `[id]` page whose `params` is a promise.
 *
 * `mocks/**` belongs to T-24, so every override here goes through `server.use(...)` inside the
 * tests and is dropped again after each one. The network stays msw — including the two spec
 * image URLs, which are answered with a 1×1 PNG so nothing can reach a live host from CI.
 */

/** Every request this test saw, in order, as `METHOD /path`. */
export type RequestLog = string[];

/** A 1×1 transparent PNG. The bytes never matter — nothing in jsdom decodes them. */
const ONE_BY_ONE_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk' +
      'YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (character) => character.charCodeAt(0),
);

/** The spec route T-24's handlers do not carry: worker-session, current claimant only. */
export function useSpecHandler(taskType: string, spec: unknown): void {
  server.use(
    http.get('*/api/tasks/:id/spec', () => HttpResponse.json({ task_type: taskType, spec })),
  );
}

/** The buyer's evidence, answered locally. Nothing in a test reaches a live image host. */
export function useImageHandlers(urls: string[]): void {
  server.use(
    ...urls.map((url) =>
      http.get(url, () =>
        HttpResponse.arrayBuffer(ONE_BY_ONE_PNG.buffer as ArrayBuffer, {
          headers: { 'content-type': 'image/png' },
        }),
      ),
    ),
  );
}

/**
 * Every request the screen makes, in order, as `METHOD /path` — the shared handlers still
 * answer them. `stop()` takes the listener off again; a leaked one would log the next test's
 * requests into this one's array.
 */
export function recordRequests(): { log: RequestLog; stop: () => void } {
  const log: RequestLog = [];

  const listener = ({ request }: { request: Request }) => {
    log.push(`${request.method} ${new URL(request.url).pathname.replace(/^\/api/, '')}`);
  };

  server.events.on('request:start', listener);
  return { log, stop: () => server.events.removeListener('request:start', listener) };
}

/** The parsed body of every `POST /tasks/:id/<route>` this test makes, in order. */
export function recordBodies(
  route: string,
  response: Record<string, unknown>,
  status = 200,
): unknown[] {
  const bodies: unknown[] = [];
  server.use(
    http.post(`*/api/tasks/:id/${route}`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json(response, { status });
    }),
  );
  return bodies;
}

/**
 * A Next `[id]` page takes `params` as a promise and reads it with `use()`.
 *
 * The promise handed over is tagged `status: 'fulfilled'` — the shape React's `use` reads
 * synchronously, and the shape Next's own router hands a page. An untagged promise makes the
 * first render suspend on something no `act()` in jsdom ever pings back, so the screen never
 * appears. The `Suspense` boundary is the one the router would provide.
 */
export function renderPage(
  Page: ComponentType<{ params: Promise<{ id: string }> }>,
  id: string,
): RenderResult {
  const value = { id };
  const params = Object.assign(Promise.resolve(value), { status: 'fulfilled', value });

  return render(
    <Suspense fallback={null}>
      <Page params={params} />
    </Suspense>,
  );
}
