import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { VisionModule } from "../vision/vision.module.js";
import { CollectionController } from "./collection.controller.js";
import { CollectionService, OBJECT_STORE } from "./collection.service.js";

@Module({
  imports: [IdentityModule, VisionModule],
  controllers: [CollectionController],
  providers: [
    CollectionService,
    {
      provide: OBJECT_STORE,
      useFactory: () => CollectionService.objectStoreFactory(),
    },
  ],
  exports: [OBJECT_STORE],
})
export class CollectionModule {}
