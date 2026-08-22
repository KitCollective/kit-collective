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
      void this.visionService.processJob(payload);
    });
  }

  enqueueFromSave(userId: string, photoBytes: Uint8Array, draftId?: string): void {
    this.visionService.enqueueFromSave(
      userId,
      photoBytes,
      (payload) => this.enqueue(payload),
      draftId,
    );
  }
}
