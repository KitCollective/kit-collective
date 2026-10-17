// Linear webhook boundary: signature check and payload shape.
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Linear asks receivers to reject deliveries older than a minute. */
const MAX_AGE_MS = 60_000;

const payloadSchema = z
  .object({
    type: z.string().min(1),
    action: z.string().min(1),
    webhookTimestamp: z.number(),
    updatedFrom: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();
export type LinearPayload = z.infer<typeof payloadSchema>;

export type LinearVerification =
  | { ok: true; payload: LinearPayload }
  | { ok: false; status: 400 | 401; error: string };

/**
 * Accepts a delivery only when `Linear-Signature` is the hex HMAC-SHA256 of
 * the raw body under the webhook's signing secret and the payload is fresh.
 */
export function verifyLinearWebhook(input: {
  rawBody: string;
  signature: string | null;
  secret: string;
  now: number;
}): LinearVerification {
  const expected = createHmac("sha256", input.secret).update(input.rawBody).digest();
  const given = Buffer.from(input.signature ?? "", "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, status: 401, error: "invalid signature" };
  }
  let json: unknown;
  try {
    json = JSON.parse(input.rawBody);
  } catch {
    return { ok: false, status: 400, error: "body is not JSON" };
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "not a Linear webhook payload" };
  }
  if (Math.abs(input.now - parsed.data.webhookTimestamp) > MAX_AGE_MS) {
    return { ok: false, status: 401, error: "stale webhookTimestamp" };
  }
  return { ok: true, payload: parsed.data };
}
