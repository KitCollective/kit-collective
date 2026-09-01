import { forwardRef, Global, Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module.js";
import { DB, type DbToken } from "../db/db.module.js";
import { ModerationModule } from "../moderation/moderation.module.js";
import { NotifyModule } from "../notify/notify.module.js";
import { AUTH, createAuth } from "./auth.js";
import { IdentityController } from "./identity.controller.js";
import { IdentityService } from "./identity.service.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

@Global()
@Module({
  imports: [forwardRef(() => BillingModule), ModerationModule, NotifyModule],
  controllers: [IdentityController],
  providers: [
    {
      provide: AUTH,
      inject: [DB],
      useFactory: (db: DbToken) => createAuth(db),
    },
    IdentityService,
    JwtAuthGuard,
  ],
  exports: [IdentityService, JwtAuthGuard, AUTH],
})
export class IdentityModule {}
