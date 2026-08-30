import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { CollectionModule } from "./collection/collection.module.js";
import { DbModule } from "./db/db.module.js";
import { HealthModule } from "./health/health.module.js";
import { IdentityModule } from "./identity/identity.module.js";
import { ModerationModule } from "./moderation/moderation.module.js";
import { VisionModule } from "./vision/vision.module.js";

@Module({
  imports: [
    DbModule,
    CatalogModule,
    HealthModule,
    IdentityModule,
    VisionModule,
    CollectionModule,
    ModerationModule,
    AdminModule,
  ],
})
export class AppModule {}
