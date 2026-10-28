import { Global, Module } from "@nestjs/common";
import { ModerationModule } from "../moderation/moderation.module.js";
import { createMailerAdapter } from "./create-mailer.adapter.js";
import { EmailAssetsController } from "./email-assets.controller.js";
import { MAILER } from "./mailer.token.js";
import { NotifyService } from "./notify.service.js";

@Global()
@Module({
  imports: [ModerationModule],
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
