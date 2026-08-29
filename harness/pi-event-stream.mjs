/**
 * Pi JSON stdout line reader for token-use collection (KIT-79, KIT-113).
 * AgentSession activity streaming was removed in KIT-113.
 */

/**
 * @param {import("node:stream").Readable} readable
 * @param {{ consumeLine: (line: string) => Promise<void>, finish?: () => Promise<void> }} consumer
 */
export async function pipeReadableJsonLines(readable, consumer) {
  let buffer = "";
  for await (const chunk of readable) {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      await consumer.consumeLine(line);
      newlineIndex = buffer.indexOf("\n");
    }
  }
  if (buffer.length > 0) {
    await consumer.consumeLine(buffer);
  }
  if (typeof consumer.finish === "function") {
    await consumer.finish();
  }
}

export const STREAMING_ROLES = new Set(["implement", "factory-checker"]);
