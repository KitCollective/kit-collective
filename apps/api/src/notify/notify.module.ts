import { Global, Module } from "@nestjs/common";
import { createMailerAdapter } from "./create-mailer.adapter.js";
import { EmailAssetsController } from "./email-assets.controller.js";
import { MAILER } from "./mailer.token.js";
import { NotifyService } from "./notify.service.js";

@Global()
@Module({
  controllers: [EmailAssetsController],
  providers: [
    {
      provide: MAILER,
      useFactory: () => createMailerAdapter(),
    },
    NotifyService,
  ],
  exports: [MAILER, NotifyService],
})
export class NotifyModule {}
