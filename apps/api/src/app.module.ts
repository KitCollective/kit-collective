import { Module } from "@nestjs/common";
import { CatalogModule } from "./catalog/catalog.module.js";
import { DbModule } from "./db/db.module.js";
import { HealthModule } from "./health/health.module.js";

@Module({
  imports: [DbModule, CatalogModule, HealthModule],
})
export class AppModule {}
