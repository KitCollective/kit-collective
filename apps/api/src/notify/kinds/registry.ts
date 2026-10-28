import type { MailEvent } from "../mail-event.js";
import { renderMail } from "../template/render.js";
import type { RenderedMail } from "../template/types.js";
import { accountDeletedMail } from "./account-deleted.js";
import { codeMail } from "./code.js";
import { emailChangeCodeMail } from "./email-change-code.js";
import { emailChangedMail } from "./email-changed.js";
import { jerseyTakenDownMail } from "./jersey-taken-down.js";
import { resetMail, verifyMail } from "./legacy.js";

/**
 * Maps an event to its finished mail. A new kind is a new definition file plus one case here;
 * the layout is never touched.
 */
export function composeMail(event: MailEvent): RenderedMail {
  switch (event.kind) {
    case "code":
      return renderMail(codeMail, event.data);
    case "email-change-code":
      return renderMail(emailChangeCodeMail, event.data);
    case "email-changed":
      return renderMail(emailChangedMail, event.data);
    case "account-deleted":
      return renderMail(accountDeletedMail, event.data);
    case "jersey-taken-down":
      return renderMail(jerseyTakenDownMail, event.data);
    case "verify":
      return verifyMail(event.data);
    case "reset":
      return resetMail(event.data);
    default: {
      const unreachable: never = event;
      throw new Error(`Unknown mail kind: ${JSON.stringify(unreachable)}`);
    }
  }
}
