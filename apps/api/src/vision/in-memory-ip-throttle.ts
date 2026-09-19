type ThrottleBucket = {
  count: number;
  windowStartMs: number;
};

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

export class InMemoryIpThrottle {
  private readonly buckets = new Map<string, ThrottleBucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number = DEFAULT_WINDOW_MS,
  ) {}

  tryConsume(ip: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(ip);

    if (!bucket || now - bucket.windowStartMs >= this.windowMs) {
      this.buckets.set(ip, { count: 1, windowStartMs: now });
      return true;
    }

    if (bucket.count >= this.limit) {
      return false;
    }

    bucket.count += 1;
    return true;
  }
}
