import { Inject, Injectable } from "@nestjs/common";
import type { MailerAdapter, MailKind } from "./mailer.adapter.js";
import { MAILER } from "./mailer.token.js";

const SUBJECTS: Record<MailKind, string> = {
  verify: "Bekræft din e-mail",
  reset: "Nulstil adgangskode",
  code: "Din kode til KitCollective",
};

@Injectable()
export class NotifyService {
  constructor(@Inject(MAILER) private readonly mailer: MailerAdapter) {}

  async sendSignInCode(input: { to: string; code: string }): Promise<void> {
    await this.mailer.send({
      to: input.to,
      kind: "code",
      subject: SUBJECTS.code,
      code: input.code,
    });
  }

  async sendAuthMail(input: { to: string; kind: "verify" | "reset"; url: string }): Promise<void> {
    await this.mailer.send({
      to: input.to,
      kind: input.kind,
      subject: SUBJECTS[input.kind],
      url: input.url,
    });
  }
}
