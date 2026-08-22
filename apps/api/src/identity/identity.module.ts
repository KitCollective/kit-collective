import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { IdentityController } from "./identity.controller.js";
import { IdentityService } from "./identity.service.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

function jwtSecret(): string {
  return process.env.JWT_SECRET ?? "development-jwt-secret-change-me";
}

@Module({
  imports: [
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { expiresIn: "7d" },
    }),
  ],
  controllers: [IdentityController],
  providers: [IdentityService, JwtAuthGuard],
  exports: [IdentityService, JwtModule, JwtAuthGuard],
})
export class IdentityModule {}
