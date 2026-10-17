// The Inbox's part of the RPC contract.
import { z } from "zod";

/**
 * Where the Inbox looks: `state` is where issues wait for a person, a label of `questionLabels`
 * marks a question. `projectId` is the bb project whose `factory.config.json` names the Linear team
 * and the workpad heading; without it the Inbox uses the Board's project.
 */
export const inboxConfig = z
  .object({
    state: z.string().trim().min(1),
    questionLabels: z.array(z.string().trim().min(1)),
    projectId: z.string().trim().min(1).optional(),
  })
  .strict();

const inboxCard = z.object({
  identifier: z.string(),
  title: z.string(),
  url: z.string(),
  pullRequest: z.object({ number: z.number(), url: z.string() }).nullable(),
  /** A review waits for the merge; a question waits for an answer. */
  kind: z.enum(["review", "question"]),
  /** The question label the issue carries; null on a review. */
  label: z.string().nullable(),
  /** What the run asked and the stage it came from; null on a review or when the workpad has none. */
  waiting: z
    .object({ ask: z.string(), stage: z.string(), asked: z.string().nullable() })
    .nullable(),
  /** The recorded review verdict and the pull request's title; null on a question. */
  review: z.object({ verdict: z.string().nullable(), change: z.string().nullable() }).nullable(),
  /** When the issue entered the state (ISO). */
  since: z.string(),
});

export const inboxContract = {
  inbox_list: {
    input: z.null(),
    output: z.object({
      /** Why the cards could not be read, when they could not. */
      error: z.string().nullable(),
      cards: z.array(inboxCard),
    }),
  },
};

export type InboxConfig = z.infer<typeof inboxConfig>;
export type InboxCardDto = z.infer<typeof inboxCard>;
export type InboxDto = z.infer<typeof inboxContract.inbox_list.output>;
