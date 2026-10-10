import type { VisionAdapter, VisionIdentityPhotoInput } from "./vision.adapter.js";

/** No-op when OpenRouter and Gemini secrets are unset. */
export class NoopVisionAdapter implements VisionAdapter {
  async infer(_photos: VisionIdentityPhotoInput[]): Promise<null> {
    return null;
  }
}
