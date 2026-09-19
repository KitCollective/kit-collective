import { Controller, Get, UseGuards } from "@nestjs/common";
import { IdentityService } from "../identity/identity.service.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";

@Controller("admin/auth")
@UseGuards(AdminAuthGuard)
export class AdminAuthController {
  constructor(private readonly identityService: IdentityService) {}

  @Get("events")
  listAuthEvents() {
    return this.identityService.listAllAuthEvents();
  }

  @Get("security")
  listAuthSecurity() {
    return this.identityService.listAuthSecurityDetections();
  }
}
