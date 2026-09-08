import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_CONTENT_TYPE,
  detectImageContentType,
  imageContentTypeOrDefault,
} from "../src/image-content-type.js";

function riffWebp(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0xac, 0x03, 0x00, 0x00], 4); // chunk size
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
  return bytes;
}

describe("detectImageContentType", () => {
  it("reads WebP from the RIFF container, not the file extension", () => {
    expect(detectImageContentType(riffWebp())).toBe("image/webp");
  });

  it("reads PNG", () => {
    expect(
      detectImageContentType(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]),
      ),
    ).toBe("image/png");
  });

  it("reads JPEG", () => {
    expect(detectImageContentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe(
      "image/jpeg",
    );
  });

  it("reads GIF and AVIF", () => {
    expect(detectImageContentType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe(
      "image/gif",
    );
    const avif = new Uint8Array(16);
    avif.set([0x00, 0x00, 0x00, 0x20], 0);
    avif.set([0x66, 0x74, 0x79, 0x70], 4);
    avif.set([0x61, 0x76, 0x69, 0x66], 8);
    expect(detectImageContentType(avif)).toBe("image/avif");
  });

  it("does not call a RIFF container without the WEBP tag an image", () => {
    const riffWave = new Uint8Array(16);
    riffWave.set([0x52, 0x49, 0x46, 0x46], 0);
    riffWave.set([0x57, 0x41, 0x56, 0x45], 8);
    expect(detectImageContentType(riffWave)).toBeUndefined();
  });

  it("has no type for an unknown or truncated blob", () => {
    expect(detectImageContentType(new Uint8Array([0x00, 0x01]))).toBeUndefined();
    expect(detectImageContentType(new Uint8Array())).toBeUndefined();
  });
});

describe("imageContentTypeOrDefault", () => {
  it("falls back to a neutral type instead of mislabelling as JPEG", () => {
    expect(imageContentTypeOrDefault(new Uint8Array([0x00]))).toBe(DEFAULT_IMAGE_CONTENT_TYPE);
    expect(imageContentTypeOrDefault(riffWebp())).toBe("image/webp");
  });
});
