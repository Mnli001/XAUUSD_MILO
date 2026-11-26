import { timingSafeEqual } from "node:crypto";

/** True only when the request carries `Authorization: Bearer $CRON_SECRET`. */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Constant-time string comparison (lengths are compared first; that leaks only the length). */
export function safeEqual(given: string, expected: string): boolean {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

let warnedFeedFallback = false;
/**
 * The shared secret for the MT5 price-feed bridge: FEED_TOKEN. Until that is set, CRON_SECRET is accepted
 * as before (with a one-time warning), so the running bridge keeps working through the upgrade.
 */
export function feedToken(env: Record<string, string | undefined> = process.env): string | null {
  const own = env.FEED_TOKEN?.trim();
  if (own) return own;
  const cron = env.CRON_SECRET?.trim();
  if (!cron) return null;
  if (!warnedFeedFallback) {
    warnedFeedFallback = true;
    console.warn("[feed] FEED_TOKEN is not set; accepting CRON_SECRET for /api/feed/tick. Set a separate FEED_TOKEN and update the bridge.");
  }
  return cron;
}
