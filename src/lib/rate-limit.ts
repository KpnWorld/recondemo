import { AppError } from "./errors";

/**
 * Fixed-window limiter kept in process memory. Good enough for a single instance;
 * swap the store for Redis/Upstash when running more than one server.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count++;
  if (b.count > limit) {
    const secs = Math.ceil((b.resetAt - now) / 1000);
    throw new AppError("RATE_LIMITED", `Too many attempts. Please wait ${secs} seconds and try again.`);
  }
}

export function resetRateLimits() {
  buckets.clear();
}
