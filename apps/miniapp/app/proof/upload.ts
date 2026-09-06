import { ApiError } from '../../lib/api';

/**
 * `POST /proofs`, multipart.
 *
 * It cannot go through `apiFetch`: that helper sets `content-type: application/json` on every
 * request, and a multipart body needs the browser to write the header itself so the boundary
 * matches the bytes. Everything else is the same — same `/api` origin, same session cookie.
 */

export type ProofsResponse = { proofHash: string; url: string; captured_at: string };

function origin(): string {
  return typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin;
}

export async function uploadProof(form: FormData): Promise<ProofsResponse> {
  const response = await fetch(new URL('/api/proofs', origin()).toString(), {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
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
  return body as ProofsResponse;
}
