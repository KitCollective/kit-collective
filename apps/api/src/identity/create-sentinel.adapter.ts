import { FakeSentinelAdapter } from "./fake-sentinel.adapter.js";
import { LiveSentinelAdapter } from "./live-sentinel.adapter.js";
import type { SentinelAdapter } from "./sentinel.adapter.js";

export function createSentinelAdapter(): SentinelAdapter {
  if (process.env.SENTINEL_ADAPTER === "live") {
    return new LiveSentinelAdapter();
  }
  if (process.env.NODE_ENV === "test" || process.env.SENTINEL_ADAPTER === "fake") {
    return new FakeSentinelAdapter();
  }
  return new LiveSentinelAdapter();
}
