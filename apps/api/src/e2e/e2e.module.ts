import { Module } from "@nestjs/common";
import { CollectionModule } from "../collection/collection.module.js";
import { E2eController } from "./e2e.controller.js";

@Module({
  imports: [CollectionModule],
  controllers: [E2eController],
})
export class E2eModule {}
