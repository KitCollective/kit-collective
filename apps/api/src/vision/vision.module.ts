import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import type { Db } from "@kit/db";
import { DB } from "../db/db.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { createGeminiVisionAdapter } from "./gemini-vision.adapter.js";
import { VISION_ADAPTER } from "./vision.adapter.js";
import { VisionController } from "./vision.controller.js";
import { VisionProcessor } from "./vision.processor.js";
import { VISION_QUEUE_NAME, VisionService } from "./vision.service.js";
import { VisionQueueService } from "./vision-queue.service.js";

function hasRedisConfig(): boolean {
  return Boolean(process.env.REDIS_URL);
}

const bullImports = hasRedisConfig()
  ? [
      BullModule.forRoot({
        connection: { url: process.env.REDIS_URL },
      }),
      BullModule.registerQueue({ name: VISION_QUEUE_NAME }),
    ]
  : [];

const bullProviders = hasRedisConfig() ? [VisionProcessor] : [];

@Module({
  imports: [...bullImports, IdentityModule],
  controllers: [VisionController],
  providers: [
    VisionService,
    VisionQueueService,
    ...bullProviders,
    {
      provide: VISION_ADAPTER,
      useFactory: (db: Db) => createGeminiVisionAdapter(db),
      inject: [DB],
    },
  ],
  exports: [VisionService, VisionQueueService, VISION_ADAPTER],
})
export class VisionModule {}
