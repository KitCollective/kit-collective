import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../identity/current-user.decorator.js";
import type { JwtPayload } from "../identity/identity.service.js";
import { JwtAuthGuard } from "../identity/jwt-auth.guard.js";
import { BillingService } from "./billing.service.js";

@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post("billing/trial")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  startTrial(@CurrentUser() user: JwtPayload) {
    return this.billingService.startTrial(user.sub);
  }
}
