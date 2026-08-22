import { Module } from "@nestjs/common";
import { CatalogModule } from "./catalog/catalog.module.js";
import { CollectionModule } from "./collection/collection.module.js";
import { DbModule } from "./db/db.module.js";
import { HealthModule } from "./health/health.module.js";
import { IdentityModule } from "./identity/identity.module.js";

@Module({
  imports: [DbModule, CatalogModule, HealthModule, IdentityModule, CollectionModule],
})
export class AppModule {}
