import { forwardRef, Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { BillingController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";
import { createIapVerifierAdapter } from "./create-iap-verifier.adapter.js";
import { IAP_VERIFIER } from "./iap-verifier.adapter.js";

@Module({
  imports: [forwardRef(() => IdentityModule)],
  controllers: [BillingController],
  providers: [
    BillingService,
    {
      provide: IAP_VERIFIER,
      useFactory: () => createIapVerifierAdapter(),
    },
  ],
  exports: [BillingService],
})
export class BillingModule {}
