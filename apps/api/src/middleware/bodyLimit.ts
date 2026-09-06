/**
 * What a request is allowed to weigh, decided from `Content-Length` before a byte of it is
 * read.
 *
 * The middleware only ever reads the header — the edge runtime should not buffer an 8 MiB
 * upload to find out it is 8 MiB. `readJsonWithCap` is the handler-side counterpart for a
 * body that arrives without a length, and it counts as it reads rather than after.
 */

/** 8 MiB for a proof photo — the frozen limit from the route table — and 16 KiB for JSON. */
export const BODY_CAPS = {
  proofs: 8 * 1024 * 1024,
  json: 16 * 1024,
} as const;

const PROOFS_PATH = '/proofs';

/** The cap that applies to this path, whatever the method. */
export function bodyCapFor(pathname: string): number {
  return pathname === PROOFS_PATH ? BODY_CAPS.proofs : BODY_CAPS.json;
}

export type BodyLimitVerdict =
  | { ok: true }
  | { ok: false; status: 413; body: { error: 'payload_too_large'; max_bytes: number } }
  | { ok: false; status: 411; body: { error: 'length_required' } };

const OK: BodyLimitVerdict = { ok: true };

const METHODS_WITH_A_BODY = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Over the cap is 413. A JSON route that sends a body without saying how long it is is 411:
 * an unmeasured body is one this layer cannot cap at all, and accepting it would make the
 * cap advisory.
 *
 * "Sends a body" is read off `Content-Type` or `Transfer-Encoding`, because a POST with
 * neither — `/tasks/:id/claim`, `/admin/pause` — is a bodyless POST and must pass. `/proofs`
 * is exempt from 411: multipart is streamed and T-17 caps the stored bytes itself.
 */
export function checkBodyLimit(req: Request, pathname: string): BodyLimitVerdict {
  const maxBytes = bodyCapFor(pathname);
  const declared = req.headers.get('content-length');

  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBytes) {
      return { ok: false, status: 413, body: { error: 'payload_too_large', max_bytes: maxBytes } };
    }
    return OK;
  }

  if (!METHODS_WITH_A_BODY.has(req.method)) return OK;
  if (pathname === PROOFS_PATH) return OK;
  const carriesABody =
    req.headers.get('content-type') !== null || req.headers.get('transfer-encoding') !== null;
  if (!carriesABody) return OK;

  return { ok: false, status: 411, body: { error: 'length_required' } };
}

/** Thrown by `readJsonWithCap`; carries the cap so a handler can answer 413 with `max_bytes`. */
export class PayloadTooLargeError extends Error {
  readonly error = 'payload_too_large' as const;
  readonly max_bytes: number;
  constructor(maxBytes: number) {
    super('payload_too_large');
    this.name = 'PayloadTooLargeError';
    this.max_bytes = maxBytes;
  }
}

/**
 * Reads a JSON body, counting as it goes and giving up the moment the running total passes
 * the cap — before `JSON.parse` sees any of it. A liar in `Content-Length` buys nothing:
 * the header is checked first, and then the bytes are checked against the same number.
 *
 * Exported for T-19's handlers to adopt; this task does not wire it into a route.
 */
export async function readJsonWithCap(req: Request, maxBytes: number): Promise<unknown> {
  const declared = req.headers.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) throw new PayloadTooLargeError(maxBytes);

  const body = req.body;
  if (!body) return JSON.parse(await req.text());

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new PayloadTooLargeError(maxBytes);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(joined));
}
