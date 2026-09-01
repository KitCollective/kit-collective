import { type Db } from "@kit/db";
import { forwardRef, Global, Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module.js";
import { DB, type DbToken } from "../db/db.module.js";
import { ModerationModule } from "../moderation/moderation.module.js";
import { AUTH, createAuth } from "./auth.js";
import { IdentityController } from "./identity.controller.js";
import { IdentityService } from "./identity.service.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

@Global()
@Module({
  imports: [forwardRef(() => BillingModule), ModerationModule],
  controllers: [IdentityController],
  providers: [
    {
      provide: AUTH,
      inject: [DB],
      useFactory: (db: DbToken) => createAuth(db as Db),
    },
    IdentityService,
    JwtAuthGuard,
  ],
  exports: [IdentityService, JwtAuthGuard, AUTH],
})
export class IdentityModule {}
