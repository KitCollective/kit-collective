import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module.js";
import { MatchProcessor } from "./match.processor.js";
import { MATCH_QUEUE_NAME, MatchService } from "./match.service.js";
import { MatchQueueService } from "./match-queue.service.js";

function hasRedisConfig(): boolean {
  return Boolean(process.env.REDIS_URL);
}

const bullImports = hasRedisConfig() ? [BullModule.registerQueue({ name: MATCH_QUEUE_NAME })] : [];

const bullProviders = hasRedisConfig() ? [MatchProcessor] : [];

@Module({
  imports: [...bullImports, BillingModule],
  providers: [MatchService, MatchQueueService, ...bullProviders],
  exports: [MatchService, MatchQueueService],
})
export class MatchModule {}
