import { billingPaywallErrorSchema } from "@kit/api-contract";
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { JwtPayload } from "../identity/identity.service.js";
import { BillingService } from "./billing.service.js";

@Injectable()
export class LiveEntitlementGuard implements CanActivate {
  constructor(private readonly billingService: BillingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    if (!user) {
      return false;
    }

    const entitlement = await this.billingService.getEntitlementForUser(user.sub);
    if (entitlement.live) {
      return true;
    }

    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        ...billingPaywallErrorSchema.parse({
          code: "PREMIUM_REQUIRED",
          message: "Premium is required",
        }),
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
