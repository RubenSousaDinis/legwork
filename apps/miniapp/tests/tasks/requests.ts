import { server } from '../../mocks/server';

/**
 * A tap on the msw server's event stream. The poll assertions are about *how many* times
 * `GET /tasks` was asked, which no fixture can tell you — only the request log can.
 */
export type SeenRequest = { method: string; pathname: string; search: string };

export function recordRequests(): {
  seen: () => SeenRequest[];
  count: (method: string, pathname: string) => number;
  reset: () => void;
  stop: () => void;
} {
  let log: SeenRequest[] = [];

  const listener = ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    log.push({ method: request.method, pathname: url.pathname, search: url.search });
  };

  server.events.on('request:start', listener);

  return {
    seen: () => log,
    count: (method, pathname) =>
      log.filter((entry) => entry.method === method && entry.pathname === pathname).length,
    reset: () => {
      log = [];
    },
    stop: () => server.events.removeListener('request:start', listener),
  };
}

/** jsdom leaves `document.hidden` a non-configurable `false`; the poll test needs it to move. */
export function controlVisibility(): { set: (hidden: boolean) => void; restore: () => void } {
  let hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  return {
    set: (next: boolean) => {
      hidden = next;
      document.dispatchEvent(new Event('visibilitychange'));
    },
    restore: () => {
      hidden = false;
    },
  };
}
