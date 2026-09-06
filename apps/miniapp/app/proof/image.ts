/**
 * The photo the phone hands over, re-encoded before it leaves the device.
 *
 * Three things fall out of one canvas round-trip, in the order they matter:
 *   1. **EXIF goes.** A camera JPEG carries the exact GPS the privacy rules keep off every
 *      public surface, plus the device serial. Drawing the pixels into a canvas and asking for
 *      a fresh JPEG keeps only the pixels. The API strips again on its side (T-18); this is the
 *      copy that never had it in the first place.
 *   2. **The upload fits.** Vercel's request body limit is 4.5 MB and `POST /proofs` refuses
 *      anything over 8 MB. A 12-megapixel phone photo is comfortably over both; a 1600 px long
 *      edge at quality 0.85 lands in the low hundreds of kilobytes.
 *   3. **It is a JPEG.** `POST /proofs` sniffs the image type, so the format is decided here
 *      rather than by whatever the camera app felt like producing (HEIC on an iPhone).
 *
 * The hash the escrow anchors is the keccak of *these* bytes, because these are the bytes the
 * phone sends. Nothing here may run after the upload.
 */

/** Long edge in CSS pixels. Small photos are re-encoded but never enlarged. */
export const MAX_LONG_EDGE_PX = 1600;
export const JPEG_QUALITY = 0.85;
export const JPEG_TYPE = 'image/jpeg';

/** Same aspect ratio, long edge capped. Both values are whole pixels — a canvas has no halves. */
export function fitLongEdge(
  width: number,
  height: number,
  maxLongEdge: number = MAX_LONG_EDGE_PX,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge || longEdge === 0) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxLongEdge / longEdge;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error('the photo could not be re-encoded')) : resolve(blob)),
      JPEG_TYPE,
      JPEG_QUALITY,
    );
  });
}

/**
 * `File` in, JPEG `Blob` out. Rejects rather than falling back to the original file: an
 * un-re-encoded upload would carry the worker's exact coordinates in its EXIF, and a silent
 * fallback is exactly the kind of thing nobody notices until the photos are already public.
 */
export async function reencodeImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitLongEdge(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (context === null) throw new Error('the photo could not be re-encoded');
    context.drawImage(bitmap, 0, 0, width, height);

    return await toBlob(canvas);
  } finally {
    bitmap.close?.();
  }
}
