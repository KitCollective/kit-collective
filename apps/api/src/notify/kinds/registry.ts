import type { MailEvent } from "../mail-event.js";
import { renderMail } from "../template/render.js";
import type { RenderedMail } from "../template/types.js";
import { codeMail } from "./code.js";
import { resetMail, verifyMail } from "./legacy.js";

/**
 * Maps an event to its finished mail. A new kind is a new definition file plus one case here;
 * the layout is never touched.
 */
export function composeMail(event: MailEvent): RenderedMail {
  switch (event.kind) {
    case "code":
      return renderMail(codeMail, event.data);
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
