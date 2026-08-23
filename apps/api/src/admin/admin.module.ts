import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminCatalogController } from "./admin-catalog.controller.js";
import { ADMIN_OBJECT_STORE, AdminCatalogService } from "./admin-catalog.service.js";

@Module({
  imports: [IdentityModule],
  controllers: [AdminCatalogController],
  providers: [
    AdminCatalogService,
    AdminAuthGuard,
    {
      provide: ADMIN_OBJECT_STORE,
      useFactory: () => AdminCatalogService.objectStoreFactory(),
    },
  ],
})
export class AdminModule {}
