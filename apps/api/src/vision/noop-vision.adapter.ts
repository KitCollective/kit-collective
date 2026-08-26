import type { VisionAdapter } from "./vision.adapter.js";

/** No-op when Gemini (or other vision provider) secrets are unset. */
export class NoopVisionAdapter implements VisionAdapter {
  async infer(): Promise<null> {
    return null;
  }
}
