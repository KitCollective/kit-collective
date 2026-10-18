// RPC output shapes more than one area returns.
import { z } from "zod";

export const ok = z.object({ ok: z.literal(true) });
