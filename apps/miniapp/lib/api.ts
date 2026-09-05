/**
 * Every call goes to the same origin under `/api`, which `next.config.ts` rewrites to the
 * API. Same-origin keeps the session cookie working inside the World App webview.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`api ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function origin(): string {
  return typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(`/api${path}`, origin()).toString(), {
    ...init,
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}
