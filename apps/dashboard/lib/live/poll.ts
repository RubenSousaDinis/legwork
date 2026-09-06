/**
 * One poll loop, used by the dashboard and by the receipt. Three rules it never
 * breaks: requests never overlap, a response that says `changed: false` costs nothing
 * downstream, and a hidden tab does not poll at all.
 */

export const DEFAULT_INTERVAL_MS = 3000;

export interface PollResult<T> {
  /** The mapped value. `onChange` sees it only when it differs from the last one. */
  value: T;
  /** The API's own "nothing moved" signal. Short-circuits before any comparison. */
  changed?: boolean;
  /** The API's backoff, in seconds. The next wait is at least this long. */
  pollAfterSeconds?: number;
}

export interface PollerOptions<T> {
  fetchOnce: () => Promise<PollResult<T>>;
  intervalMs?: number;
  onChange: (value: T) => void;
  /** Injected by tests; defaults to the document when there is one. */
  isHidden?: () => boolean;
  onError?: (error: unknown) => void;
}

export interface Poller {
  dispose: () => void;
}

function documentHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden === true;
}

export function createPoller<T>(options: PollerOptions<T>): Poller {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const isHidden = options.isHidden ?? documentHidden;

  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previous: string | undefined;

  function schedule(delayMs: number): void {
    if (disposed) return;
    timer = setTimeout(() => {
      void tick();
    }, delayMs);
  }

  async function tick(): Promise<void> {
    if (disposed) return;
    // A hidden tab costs nothing: no request, just the next check.
    if (isHidden()) {
      schedule(intervalMs);
      return;
    }

    let wait = intervalMs;
    try {
      // Awaited before anything is scheduled, so a slow response delays the next
      // request rather than racing it.
      const result = await options.fetchOnce();
      if (disposed) return;
      if (typeof result.pollAfterSeconds === 'number') {
        wait = Math.max(intervalMs, result.pollAfterSeconds * 1000);
      }
      if (result.changed !== false) {
        const next = JSON.stringify(result.value);
        if (next !== previous) {
          previous = next;
          options.onChange(result.value);
        }
      }
    } catch (error) {
      options.onError?.(error);
    }
    schedule(wait);
  }

  schedule(intervalMs);

  return {
    dispose() {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
