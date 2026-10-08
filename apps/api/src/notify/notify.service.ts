import { Inject, Injectable } from "@nestjs/common";
import type { MailerAdapter, MailKind } from "./mailer.adapter.js";
import { MAILER } from "./mailer.token.js";

const SUBJECTS: Record<MailKind, string> = {
  verify: "Bekræft din e-mail",
  reset: "Nulstil adgangskode",
};

@Injectable()
export class NotifyService {
  constructor(@Inject(MAILER) private readonly mailer: MailerAdapter) {}

  async sendAuthMail(input: { to: string; kind: MailKind; url: string }): Promise<void> {
    await this.mailer.send({
      to: input.to,
      kind: input.kind,
      subject: SUBJECTS[input.kind],
      url: input.url,
    });
  }
}
