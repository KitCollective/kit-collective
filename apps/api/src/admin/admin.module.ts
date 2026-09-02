import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module.js";
import { CollectionModule } from "../collection/collection.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminBillingController } from "./admin-billing.controller.js";
import { AdminCatalogController } from "./admin-catalog.controller.js";
import { ADMIN_OBJECT_STORE, AdminCatalogService } from "./admin-catalog.service.js";
import { AdminCollectionController } from "./admin-collection.controller.js";
import { AdminCollectionService } from "./admin-collection.service.js";

@Module({
  imports: [IdentityModule, CollectionModule, BillingModule],
  controllers: [
    AdminCatalogController,
    AdminCollectionController,
    AdminBillingController,
    AdminAuthController,
  ],
  providers: [
    AdminCatalogService,
    AdminCollectionService,
    AdminAuthGuard,
    {
      provide: ADMIN_OBJECT_STORE,
      useFactory: () => AdminCatalogService.objectStoreFactory(),
    },
  ],
})
export class AdminModule {}
