export type CollectorImageContentType = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const FTYP = [0x66, 0x74, 0x79, 0x70];
const HEIC_BRANDS = [
  [0x68, 0x65, 0x69, 0x63], // heic
  [0x68, 0x65, 0x69, 0x78], // heix
  [0x68, 0x65, 0x76, 0x63], // hevc
  [0x68, 0x65, 0x76, 0x78], // hevx
] as const;

/**
 * Content type from the magic number of a collector upload: JPEG, PNG, WebP or HEIC.
 * `undefined` for anything else. The generic `mif1`/`msf1` brands are left out on purpose,
 * they also match AVIF.
 */
export function collectorImageContentType(
  bytes: Uint8Array,
): CollectorImageContentType | undefined {
  if (startsWith(bytes, JPEG)) {
    return "image/jpeg";
  }
  if (startsWith(bytes, PNG)) {
    return "image/png";
  }
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) {
    return "image/webp";
  }
  if (startsWith(bytes, FTYP, 4) && HEIC_BRANDS.some((brand) => startsWith(bytes, brand, 8))) {
    return "image/heic";
  }
  return undefined;
}
