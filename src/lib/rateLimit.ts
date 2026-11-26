import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * Fixed-window attempt counters kept in Postgres (table rate_limits), so every server instance shares them.
 * Keys carry no raw email or IP: they are hashed, so the table holds nothing personal.
 */
export type Limit = { max: number; windowMs: number };

export const LIMITS = {
  loginIp: { max: 30, windowMs: 15 * 60e3 },
  loginEmail: { max: 10, windowMs: 15 * 60e3 },
  registerIp: { max: 10, windowMs: 60 * 60e3 },
  registerEmail: { max: 5, windowMs: 60 * 60e3 },
  telegramLink: { max: 5, windowMs: 60 * 60e3 },
  telegramReset: { max: 3, windowMs: 60 * 60e3 },
  resetSubmit: { max: 10, windowMs: 15 * 60e3 },
} satisfies Record<string, Limit>;

const keyOf = (scope: string, id: string) => `${scope}:${createHash("sha256").update(id).digest("hex").slice(0, 32)}`;

/**
 * Counts one attempt for (scope, id) and says whether it is still within the limit.
 * The window restarts once it has run out. Atomic: one upsert, safe under concurrent requests.
 */
export async function hit(scope: string, id: string, limit: Limit, now = new Date()): Promise<boolean> {
  const key = keyOf(scope, id);
  const cutoff = new Date(now.getTime() - limit.windowMs);
  const r = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, count, window_start) VALUES (${key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start <= ${cutoff} THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start <= ${cutoff} THEN ${now} ELSE rate_limits.window_start END
    RETURNING count`);
  return Number(r.rows[0]?.count ?? 1) <= limit.max;
}

/** Forgets the attempts for (scope, id), e.g. after a successful sign-in. */
export async function clearHits(scope: string, id: string): Promise<void> {
  await db.execute(sql`DELETE FROM rate_limits WHERE key = ${keyOf(scope, id)}`);
}

/** Drops counters whose window ended long ago; called from the scheduler or opportunistically. */
export async function pruneRateLimits(now = new Date(), olderThanMs = 24 * 60 * 60e3): Promise<void> {
  await db.execute(sql`DELETE FROM rate_limits WHERE window_start < ${new Date(now.getTime() - olderThanMs)}`);
}

/**
 * The client's IP as the platform's proxy reports it. Railway's edge sets X-Real-IP to the connecting
 * address and appends that address to X-Forwarded-For, so X-Real-IP is used first, then the last
 * X-Forwarded-For entry (the one our proxy added; earlier entries are whatever the client sent).
 * Never trusted for anything but counting attempts.
 */
export function clientIp(h: Pick<Headers, "get"> | null | undefined): string {
  if (!h) return "unknown";
  const real = h.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const fwd = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return fwd?.length ? fwd[fwd.length - 1].slice(0, 64) : "unknown";
}

/** The current request's client IP inside a server action or route, or "unknown" outside one (tests, scripts). */
export async function requestIp(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    return clientIp(await headers());
  } catch {
    return "unknown";
  }
}
