import type { VisionAdapter, VisionIdentityPhotoInput } from "./vision.adapter.js";

/** No-op when Gemini (or other vision provider) secrets are unset. */
export class NoopVisionAdapter implements VisionAdapter {
  async infer(_photos: VisionIdentityPhotoInput[]): Promise<null> {
    return null;
  }
}
