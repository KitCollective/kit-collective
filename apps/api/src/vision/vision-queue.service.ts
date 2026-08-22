import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Optional } from "@nestjs/common";
import type { Queue } from "bullmq";
import { VISION_QUEUE_NAME, type VisionJobPayload, VisionService } from "./vision.service.js";

@Injectable()
export class VisionQueueService {
  constructor(
    private readonly visionService: VisionService,
    @Optional() @InjectQueue(VISION_QUEUE_NAME) private readonly queue?: Queue<VisionJobPayload>,
  ) {}

  enqueue(payload: VisionJobPayload): void {
    if (this.queue) {
      void this.queue.add("infer", payload, {
        removeOnComplete: true,
        removeOnFail: 100,
      });
      return;
    }

    setImmediate(() => {
      void this.visionService.processJob(payload).catch(() => {
        // Vision is fail-open — background inference must not crash the process.
      });
    });
  }

  /** Creates the VisionLog row synchronously; inference runs async. Returns job id for Save reconciliation. */
  async enqueueFromSave(userId: string, photoBytes: Uint8Array, draftId?: string): Promise<string> {
    const jobId = await this.visionService.createJob(userId, photoBytes, draftId);
    this.visionService.enqueueJob(
      {
        jobId,
        userId,
        draftId,
        photoBytes,
      },
      (payload) => this.enqueue(payload),
    );
    return jobId;
  }
}
