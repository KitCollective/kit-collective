export type SentinelDetection = {
  sentinelId: string;
  kind: string;
  userId: string | null;
  summary: string;
  detectedAt: Date;
};

export type SentinelAdapter = {
  listDetections(): Promise<SentinelDetection[]>;
};
