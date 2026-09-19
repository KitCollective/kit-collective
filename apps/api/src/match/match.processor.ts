import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Job } from "bullmq";
import { MATCH_QUEUE_NAME, type MatchJobPayload, MatchService } from "./match.service.js";

@Injectable()
@Processor(MATCH_QUEUE_NAME)
export class MatchProcessor extends WorkerHost {
  constructor(private readonly matchService: MatchService) {
    super();
  }

  async process(job: Job<MatchJobPayload>): Promise<void> {
    await this.matchService.processSaveMatchJob(job.data);
  }
}
