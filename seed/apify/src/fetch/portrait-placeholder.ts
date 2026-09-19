import { createHash } from "node:crypto";

/**
 * Transfermarkt answers every player without an archive portrait with one shared
 * silhouette. Persisting it as a `player_photo` row makes a grey outline look like a real
 * portrait, so a match is a hole on that player — the player still lands, without a photo.
 *
 * The URL is the cheap signal (it skips the GET), the digest is the honest one: the CDN
 * serves the same silhouette under `/portrait/medium/default.jpg` and under `.png`, and
 * always as WebP, so neither the path extension nor the byte length identifies it alone.
 */
const PLACEHOLDER_PORTRAIT_DIGESTS: ReadonlySet<string> = new Set([
  // https://img.a.transfermarkt.technology/portrait/medium/default.jpg?lm=4711 — 948-byte WebP
  "427671144a1e27e1d19441c7c1d4da4cc6093b85854757269782e443c95b4fba",
]);

const PLACEHOLDER_FILE_NAME = /^default\.(?:jpe?g|png|webp|avif|gif)$/i;

/** `…/portrait/<size>/default.jpg?lm=4711` — the query string is a cache buster. */
export function isPlaceholderPortraitUrl(src: string): boolean {
  const pathname = src.split(/[?#]/)[0] ?? "";
  return PLACEHOLDER_FILE_NAME.test(pathname.slice(pathname.lastIndexOf("/") + 1));
}

export function isPlaceholderPortraitBytes(bytes: Uint8Array): boolean {
  return PLACEHOLDER_PORTRAIT_DIGESTS.has(createHash("sha256").update(bytes).digest("hex"));
}

export function placeholderPortraitDigests(): readonly string[] {
  return [...PLACEHOLDER_PORTRAIT_DIGESTS];
}
