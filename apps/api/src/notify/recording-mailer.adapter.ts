import type { MailerAdapter, OutboundMail } from "./mailer.adapter.js";

export const recordedMails: OutboundMail[] = [];

export function resetRecordedMails(): void {
  recordedMails.length = 0;
}

export class RecordingMailerAdapter implements MailerAdapter {
  async send(mail: OutboundMail): Promise<void> {
    recordedMails.push(mail);
  }
}

export const recordingMailer = new RecordingMailerAdapter();
