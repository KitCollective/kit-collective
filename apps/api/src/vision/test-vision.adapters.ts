import type { VisionAdapter, VisionInferenceResult } from "./vision.adapter.js";

export class SlowVisionAdapter implements VisionAdapter {
  constructor(
    private readonly delayMs: number,
    private readonly result: VisionInferenceResult | null = null,
  ) {}

  async infer(): Promise<VisionInferenceResult | null> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return this.result;
  }
}

export class FailingVisionAdapter implements VisionAdapter {
  async infer(): Promise<VisionInferenceResult | null> {
    throw new Error("Vision adapter failed");
  }
}
