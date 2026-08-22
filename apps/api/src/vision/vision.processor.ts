import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Job } from "bullmq";
import { VISION_QUEUE_NAME, type VisionJobPayload, VisionService } from "./vision.service.js";

@Injectable()
@Processor(VISION_QUEUE_NAME)
export class VisionProcessor extends WorkerHost {
  constructor(private readonly visionService: VisionService) {
    super();
  }

  async process(job: Job<VisionJobPayload>): Promise<void> {
    await this.visionService.processJob(job.data);
  }
}
