import type {
  VisionAdapter,
  VisionCallContext,
  VisionGroupingInferenceResult,
  VisionGroupingOptions,
  VisionGroupingPhotoInput,
  VisionIdentityPhotoInput,
  VisionInferenceResult,
} from "./vision.adapter.js";

/**
 * Routes one Collector's Vision jobs to a second adapter. Every other Collector,
 * and unsigned Vision, stays on the live adapter.
 */
export class CollectorScopedVisionAdapter implements VisionAdapter {
  constructor(
    private readonly live: VisionAdapter,
    private readonly scoped: VisionAdapter,
    private readonly collectorId: string,
  ) {}

  infer(
    photos: VisionIdentityPhotoInput[],
    context?: VisionCallContext,
  ): Promise<VisionInferenceResult | null> {
    return this.adapterFor(context).infer(photos, context);
  }

  async inferGrouping(
    photos: VisionGroupingPhotoInput[],
    options?: VisionGroupingOptions,
    context?: VisionCallContext,
  ): Promise<VisionGroupingInferenceResult | null> {
    const adapter = this.adapterFor(context);
    return adapter.inferGrouping ? adapter.inferGrouping(photos, options, context) : null;
  }

  private adapterFor(context?: VisionCallContext): VisionAdapter {
    return context?.userId === this.collectorId ? this.scoped : this.live;
  }
}
