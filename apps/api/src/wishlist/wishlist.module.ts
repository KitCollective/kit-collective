import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module.js";
import { LiveEntitlementGuard } from "../billing/live-entitlement.guard.js";
import { WishlistController } from "./wishlist.controller.js";
import { WishlistService } from "./wishlist.service.js";

@Module({
  imports: [BillingModule],
  controllers: [WishlistController],
  providers: [WishlistService, LiveEntitlementGuard],
})
export class WishlistModule {}
