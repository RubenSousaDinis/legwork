import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import { PROOFS_RESPONSE, SUBMIT_DISPUTED_RESPONSE, SUBMIT_RESPONSE } from '../../mocks/handlers';
import { scenario } from '../../mocks/scenarios';
import { server } from '../../mocks/server';

/**
 * What the proof screen needs that jsdom does not have: a camera, a canvas that encodes, an
 * object URL, and a phone that either knows where it is or honestly does not.
 *
 * The network stays msw. `recordProofRequests` overrides two handlers with the *same fixture
 * bodies* `mocks/handlers.ts` serves — the override exists to keep the request, not to change
 * the answer — and `mocks/server.ts` drops it again after each test.
 */

/** `GeolocationPositionError` codes, which is all `lib/gps.ts` reads. */
export const GEO_ERROR = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as const;

export type ProofRequests = { proofs: FormData[]; submits: unknown[] };

export function recordProofRequests(): ProofRequests {
  const captured: ProofRequests = { proofs: [], submits: [] };

  server.use(
    http.post('*/api/proofs', async ({ request }) => {
      captured.proofs.push(await request.formData());
      return HttpResponse.json(PROOFS_RESPONSE);
    }),
    http.post('*/api/tasks/:id/submit', async ({ request }) => {
      captured.submits.push(await request.json());
      return HttpResponse.json(
        scenario().submit === 'disputed' ? SUBMIT_DISPUTED_RESPONSE : SUBMIT_RESPONSE,
      );
    }),
  );

  return captured;
}

/**
 * jsdom's `Blob` is a stub — `slice`, `size` and `type`, and nothing that reads the bytes. A
 * `FormData` carrying one therefore hangs forever when `fetch` tries to serialize it, which is
 * the whole multipart upload. Filling in the three standard readers over `FileReader` (which
 * jsdom does implement) is the smallest thing that makes the real code path testable; a
 * browser has had all three for years.
 */
function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('the blob could not be read'));
    reader.readAsArrayBuffer(blob);
  });
}

export function polyfillBlobReading(): void {
  const proto = Blob.prototype as unknown as Record<string, unknown>;
  if (typeof proto.arrayBuffer === 'function') return;

  proto.arrayBuffer = async function (this: Blob) {
    return (await readBytes(this)).buffer;
  };
  proto.text = async function (this: Blob) {
    return new TextDecoder().decode(await readBytes(this));
  };
  proto.stream = function (this: Blob) {
    const pending = readBytes(this);
    return new ReadableStream({
      async start(controller) {
        controller.enqueue(await pending);
        controller.close();
      },
    });
  };
}

/** A 3000 × 2000 camera photo through a canvas that answers with a JPEG blob. */
export function stubImagePipeline(): void {
  polyfillBlobReading();

  const bitmap = { width: 3000, height: 2000, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);

  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
  ) {
    callback(new Blob(['jpeg-bytes'], { type: type ?? 'image/jpeg' }));
  });

  // jsdom has no object URLs; the thumbnail and the paid state both hang off one.
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:legwork/proof'),
    revokeObjectURL: vi.fn(),
  }));
}

type PositionCallback = (position: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type ErrorCallback = (error: { code: number }) => void;

export type GeolocationStub = {
  getCurrentPosition: (
    onSuccess: PositionCallback,
    onError?: ErrorCallback,
    options?: PositionOptions,
  ) => void;
};

/** Installs a `navigator.geolocation` and hands back the options it was called with. */
export function stubGeolocation(stub: GeolocationStub | null): { options: PositionOptions[] } {
  const options: PositionOptions[] = [];
  const value =
    stub === null
      ? undefined
      : {
          getCurrentPosition: (
            onSuccess: PositionCallback,
            onError?: ErrorCallback,
            passed?: PositionOptions,
          ) => {
            if (passed !== undefined) options.push(passed);
            stub.getCurrentPosition(onSuccess, onError, passed);
          },
        };

  Object.defineProperty(navigator, 'geolocation', { configurable: true, value });
  return { options };
}

/** A fix, or the named failure. */
export const geolocationFailing = (code: number): GeolocationStub => ({
  getCurrentPosition: (_onSuccess, onError) => onError?.({ code }),
});

export const geolocationAt = (latitude: number, longitude: number, accuracy: number): GeolocationStub => ({
  getCurrentPosition: (onSuccess) => onSuccess({ coords: { latitude, longitude, accuracy } }),
});

/** What the camera hands the file input. The bytes never matter — the canvas re-encodes. */
export function cameraFile(): File {
  return new File(['camera-bytes'], 'IMG_0001.jpg', { type: 'image/jpeg' });
}
