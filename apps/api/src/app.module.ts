import { Module } from "@nestjs/common";
import { CatalogModule } from "./catalog/catalog.module.js";
import { DbModule } from "./db/db.module.js";

@Module({
  imports: [DbModule, CatalogModule],
})
export class AppModule {}
