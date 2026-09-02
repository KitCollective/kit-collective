import { forwardRef, Global, Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module.js";
import { DB, type DbToken } from "../db/db.module.js";
import { ModerationModule } from "../moderation/moderation.module.js";
import { NotifyModule } from "../notify/notify.module.js";
import { AUTH, createAuth } from "./auth.js";
import { createIdTokenAdapter } from "./create-id-token.adapter.js";
import { createSentinelAdapter } from "./create-sentinel.adapter.js";
import { ID_TOKEN_VERIFIER } from "./id-token.token.js";
import { IdentityController } from "./identity.controller.js";
import { IdentityService } from "./identity.service.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { SENTINEL } from "./sentinel.token.js";

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
    {
      provide: ID_TOKEN_VERIFIER,
      useFactory: () => createIdTokenAdapter(),
    },
    {
      provide: SENTINEL,
      useFactory: () => createSentinelAdapter(),
    },
    IdentityService,
    JwtAuthGuard,
  ],
  exports: [IdentityService, JwtAuthGuard, AUTH],
})
export class IdentityModule {}
