// The Home area's part of the RPC contract.
import { z } from "zod";

/** How many of the newest Inbox cards bb's Home lists. */
export const HOME_CARDS = 3;

const homeCard = z.object({
  identifier: z.string(),
  title: z.string(),
  /** A review waits for the merge; a question waits for an answer. */
  kind: z.enum(["review", "question"]),
  /** When the issue entered the Inbox state (ISO). */
  since: z.string(),
});

export const homeContract = {
  /** The number of Inbox cards and the newest few, read from Linear on each call. */
  home_waiting: {
    input: z.null(),
    output: z.object({
      /** Why the cards could not be read, when they could not. */
      error: z.string().nullable(),
      count: z.number(),
      newest: z.array(homeCard),
    }),
  },
};

export type HomeDto = z.infer<typeof homeContract.home_waiting.output>;
