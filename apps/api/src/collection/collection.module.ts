import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { CollectionController } from "./collection.controller.js";

@Module({
  imports: [IdentityModule],
  controllers: [CollectionController],
})
export class CollectionModule {}
