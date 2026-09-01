import { forwardRef, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { BillingModule } from "../billing/billing.module.js";
import { requireJwtSecret } from "../config/jwt-secret.js";
import { ModerationModule } from "../moderation/moderation.module.js";
import { IdentityController } from "./identity.controller.js";
import { IdentityService } from "./identity.service.js";
import { JwtStrategy } from "./jwt.strategy.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

@Module({
  imports: [
    forwardRef(() => BillingModule),
    ModerationModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: requireJwtSecret(),
        signOptions: { expiresIn: "7d" },
      }),
    }),
  ],
  controllers: [IdentityController],
  providers: [IdentityService, JwtStrategy, JwtAuthGuard],
  exports: [IdentityService, JwtModule, JwtAuthGuard],
})
export class IdentityModule {}
