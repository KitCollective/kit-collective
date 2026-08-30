import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { MatchModule } from "../match/match.module.js";
import { ModerationModule } from "../moderation/moderation.module.js";
import { VisionModule } from "../vision/vision.module.js";
import { CollectionController } from "./collection.controller.js";
import { CollectionService, OBJECT_STORE } from "./collection.service.js";
import { CollectionShortcutsService } from "./collection-shortcuts.service.js";

@Module({
  imports: [IdentityModule, VisionModule, MatchModule, ModerationModule],
  controllers: [CollectionController],
  providers: [
    CollectionService,
    CollectionShortcutsService,
    {
      provide: OBJECT_STORE,
      useFactory: () => CollectionService.objectStoreFactory(),
    },
  ],
  exports: [OBJECT_STORE],
})
export class CollectionModule {}
