import { offerPatchRequestSchema } from "@kit/api-contract";
import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { BillingService } from "../billing/billing.service.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";

@Controller("admin/billing")
@UseGuards(AdminAuthGuard)
export class AdminBillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get("offer")
  getOffer() {
    return this.billingService.getOffer();
  }

  @Patch("offer")
  updateOffer(@Body() body: unknown) {
    const parsed = offerPatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Invalid offer update");
    }
    return this.billingService.updateOffer(parsed.data);
  }
}
