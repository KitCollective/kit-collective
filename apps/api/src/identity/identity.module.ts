import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { requireJwtSecret } from "../config/jwt-secret.js";
import { IdentityController } from "./identity.controller.js";
import { IdentityService } from "./identity.service.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: requireJwtSecret(),
        signOptions: { expiresIn: "7d" },
      }),
    }),
  ],
  controllers: [IdentityController],
  providers: [IdentityService, JwtAuthGuard],
  exports: [IdentityService, JwtModule, JwtAuthGuard],
})
export class IdentityModule {}
