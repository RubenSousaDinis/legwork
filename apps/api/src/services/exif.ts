/**
 * Re-encoding, which is how the metadata is removed.
 *
 * An untreated phone photo carries a device id and a GPS fix good to about five metres.
 * Nothing here parses the EXIF block to delete fields from it: sharp carries no metadata
 * onto its output unless it is explicitly told to, and this pipeline never tells it to, so
 * decoding the pixels and encoding a fresh JPEG leaves nothing to strip. `rotate()` with no
 * argument is the one thing the EXIF is read *for* — it bakes the orientation flag into the
 * pixels before it is dropped, so the stripped copy is the right way up.
 *
 * The bytes hashed onchain are the ones that arrived, not these. This function runs after
 * the hash, never before it.
 */
import sharp from 'sharp';

export interface StrippedImage {
  bytes: Buffer;
  width: number;
  height: number;
}

export type SniffedType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Every metadata block sharp can report, and none of them may survive the re-encode. */
const METADATA_BLOCKS = ['exif', 'icc', 'iptc', 'xmp', 'orientation'] as const;

/**
 * The content type of the bytes themselves. The `Content-Type` a client puts on a multipart
 * part is a claim, and the upload route decides on the magic bytes instead.
 */
export function sniffImageType(raw: Buffer): SniffedType | undefined {
  if (raw.length >= 3 && raw[0] === 0xff && raw[1] === 0xd8 && raw[2] === 0xff) return 'image/jpeg';
  if (raw.length >= 8 && raw.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'image/png';
  }
  if (
    raw.length >= 12 &&
    raw.subarray(0, 4).toString('latin1') === 'RIFF' &&
    raw.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return undefined;
}

/** Always JPEG out, whatever came in: one served format, one set of metadata rules. */
export async function stripImage(raw: Buffer): Promise<StrippedImage> {
  const { data, info } = await sharp(raw)
    .rotate()
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}

/** Throws when any metadata block is still present — the assertion the unit test leans on. */
export async function assertNoMetadata(bytes: Buffer): Promise<void> {
  const metadata = (await sharp(bytes).metadata()) as Record<string, unknown>;
  const present = METADATA_BLOCKS.filter((block) => metadata[block] !== undefined);
  if (present.length > 0) {
    throw new Error(`stripped image still carries metadata: ${present.join(', ')}`);
  }
}
