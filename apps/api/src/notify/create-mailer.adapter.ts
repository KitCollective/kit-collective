import type { MailerAdapter } from "./mailer.adapter.js";
import { recordingMailer } from "./recording-mailer.adapter.js";
import { SesMailerAdapter } from "./ses-mailer.adapter.js";

export function createMailerAdapter(): MailerAdapter {
  if (process.env.MAILER_ADAPTER === "ses") {
    return new SesMailerAdapter();
  }
  return recordingMailer;
}
