/**
 * Content type from the bytes, never from the URL: Transfermarkt serves WebP portraits
 * under `.jpg` and `.png` paths, so an extension-derived `image/jpeg` mislabels the object
 * in R2 and every consumer that trusts the stored header.
 */
export const DEFAULT_IMAGE_CONTENT_TYPE = "application/octet-stream";

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF = [0x47, 0x49, 0x46, 0x38];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const FTYP = [0x66, 0x74, 0x79, 0x70];
const AVIF_BRAND = [0x61, 0x76, 0x69, 0x66];
const AVIS_BRAND = [0x61, 0x76, 0x69, 0x73];

/** `undefined` when the magic number matches no image we store. */
export function detectImageContentType(bytes: Uint8Array): string | undefined {
  if (startsWith(bytes, JPEG)) {
    return "image/jpeg";
  }
  if (startsWith(bytes, PNG)) {
    return "image/png";
  }
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) {
    return "image/webp";
  }
  if (startsWith(bytes, GIF)) {
    return "image/gif";
  }
  if (
    startsWith(bytes, FTYP, 4) &&
    (startsWith(bytes, AVIF_BRAND, 8) || startsWith(bytes, AVIS_BRAND, 8))
  ) {
    return "image/avif";
  }
  return undefined;
}

/** Same detection, with a neutral type so an unknown blob still gets a header. */
export function imageContentTypeOrDefault(bytes: Uint8Array): string {
  return detectImageContentType(bytes) ?? DEFAULT_IMAGE_CONTENT_TYPE;
}
