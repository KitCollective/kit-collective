import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
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

  @Post("billing/verify")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  verifyPurchase(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.billingService.verifyPurchase(user.sub, body);
  }

  @Post("billing/restore")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  restorePurchases(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.billingService.restorePurchases(user.sub, body);
  }
}
