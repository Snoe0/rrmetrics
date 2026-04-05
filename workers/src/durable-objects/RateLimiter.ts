const WINDOW_MS = 60_000; // 1 minute sliding window
const LIMIT = 60;         // requests per window
const GRACE = 3;          // soft-limit grace requests before hard block
const IDLE_TIMEOUT_MS = 5 * 60_000; // 5 min idle → clear state

export class RateLimiterDO implements DurableObject {
  private timestamps: number[] = [];
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const now = Date.now();

    // Prune timestamps outside the sliding window
    const windowStart = now - WINDOW_MS;
    this.timestamps = this.timestamps.filter((t) => t >= windowStart);

    // Count current requests in window
    const count = this.timestamps.length;
    const hardLimit = LIMIT + GRACE; // 63

    // Determine if this request is allowed
    const allowed = count < hardLimit;
    const warning = count >= LIMIT && count < hardLimit;

    if (allowed) {
      this.timestamps.push(now);
    }

    // Calculate reset time (when the oldest timestamp in window expires)
    const resetAt = this.timestamps.length > 0
      ? this.timestamps[0] + WINDOW_MS
      : now + WINDOW_MS;

    // Schedule alarm to self-clean after idle period
    await this.state.storage.setAlarm(now + IDLE_TIMEOUT_MS);

    return new Response(
      JSON.stringify({
        allowed,
        count: this.timestamps.length,
        resetAt,
        warning,
        limit: LIMIT,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  async alarm(): Promise<void> {
    // If no recent activity, clear state to free memory
    const now = Date.now();
    const windowStart = now - WINDOW_MS;
    this.timestamps = this.timestamps.filter((t) => t >= windowStart);

    if (this.timestamps.length === 0) {
      this.timestamps = [];
    }
  }
}
