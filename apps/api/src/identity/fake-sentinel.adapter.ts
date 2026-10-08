import type { SentinelAdapter, SentinelDetection } from "./sentinel.adapter.js";

/** Fixture detection HTTP tests assert by literal kind + summary. */
export class FakeSentinelAdapter implements SentinelAdapter {
  async listDetections(): Promise<SentinelDetection[]> {
    return [
      {
        sentinelId: "sentinel-fixture-1",
        kind: "credential_stuffing",
        userId: null,
        summary: "Credential stuffing",
        detectedAt: new Date("2026-09-01T12:00:00.000Z"),
      },
    ];
  }
}
