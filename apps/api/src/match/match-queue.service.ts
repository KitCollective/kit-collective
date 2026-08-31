import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Optional } from "@nestjs/common";
import type { Queue } from "bullmq";
import { MATCH_QUEUE_NAME, type MatchJobPayload, MatchService } from "./match.service.js";

@Injectable()
export class MatchQueueService {
  constructor(
    private readonly matchService: MatchService,
    @Optional() @InjectQueue(MATCH_QUEUE_NAME) private readonly queue?: Queue<MatchJobPayload>,
  ) {}

  enqueueFromSave(savedUserJerseyId: string, saverUserId: string): void {
    const payload: MatchJobPayload = { savedUserJerseyId, saverUserId };
    if (this.queue) {
      void this.queue.add("match", payload, {
        removeOnComplete: true,
        removeOnFail: 100,
      });
      return;
    }

    setImmediate(() => {
      void this.matchService.processSaveMatchJob(payload).catch(() => {
        // Match is fail-open — background matching must not crash the process.
      });
    });
  }
}
