// The Issue-thread archiver's part of the RPC contract.
import { z } from "zod";

export const threadsContract = {
  threads_archive_done: {
    input: z.null(),
    output: z.object({
      /** Why the sweep could not run, when it could not. */
      error: z.string().nullable(),
      /** The Issue threads archived by this sweep, each with the child threads archived beside it. */
      archived: z.array(z.object({ issue: z.string(), threadIds: z.array(z.string()) })),
    }),
  },
};

export type ArchiveSweepDto = z.infer<typeof threadsContract.threads_archive_done.output>;
