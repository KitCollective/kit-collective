// The Inbox's part of the RPC contract.
import { z } from "zod";
import {
  type InboxCardDto,
  inboxCard,
  type LandingDto,
  type LandingPhase,
} from "../shared/contract.js";

/**
 * Where the Inbox looks: `state` is where issues wait for a person, a label of `questionLabels`
 * marks a question. `projectId` is the bb project whose `factory.config.json` names the Linear team
 * and the workpad heading; without it the Inbox uses the Board's project. `alarmIssue` is the issue
 * the watchdog comments on; without it the Inbox shows no alarm cards. Approve needs the landing
 * settings: `approveTo` is the merge-permission state an approval moves the issue to, `landHost` the
 * runs machine's host id and `landCheckout` the absolute path of its main checkout, where the
 * landing script runs.
 */
export const inboxConfig = z
  .object({
    state: z.string().trim().min(1),
    questionLabels: z.array(z.string().trim().min(1)),
    projectId: z.string().trim().min(1).optional(),
    alarmIssue: z.string().trim().min(1).optional(),
    approveTo: z.string().trim().min(1).optional(),
    landHost: z.string().trim().min(1).optional(),
    landCheckout: z.string().trim().startsWith("/").optional(),
  })
  .strict();

/** What an action answers: why the Linear write failed, or null when it went through. */
const settled = z.object({ error: z.string().nullable() });

export const inboxContract = {
  inbox_list: {
    input: z.null(),
    output: z.object({
      /** Why the cards could not be read, when they could not. */
      error: z.string().nullable(),
      cards: z.array(inboxCard),
    }),
  },
  /** Writes `answer` as a comment, swaps the question label for the Loop's ready label and moves the issue to the Loop's state. */
  inbox_answer: {
    input: z.object({ identifier: z.string().min(1), answer: z.string() }),
    output: settled,
  },
  /** Marks a mention's notification read in Linear, as the key owner. */
  inbox_read: {
    input: z.object({ notificationId: z.string().min(1) }),
    output: settled,
  },
  /** The same for a green review, whose comment is the reason it goes back. */
  inbox_reject: {
    input: z.object({ identifier: z.string().min(1), comment: z.string() }),
    output: settled,
  },
  /** Comments the approval and moves a green review to the merge-permission state, then lands it on the runs machine. */
  inbox_approve: {
    input: z.object({ identifier: z.string().min(1) }),
    output: settled,
  },
};

export type InboxConfig = z.infer<typeof inboxConfig>;
export type { InboxCardDto, LandingDto, LandingPhase };
export type InboxDto = z.infer<typeof inboxContract.inbox_list.output>;
