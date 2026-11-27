import { normaliseEmail, verifyCredentials } from "./users";
import { LIMITS, clearHits, clientIp, hit } from "./rateLimit";

export type Authorized = { id: string; email: string; name: string; sv: number };

/**
 * The credentials check behind sign-in, with attempts counted per IP and per IP+email (DB-backed, see rateLimit.ts).
 * Over either limit: "limited", before bcrypt runs (auth.ts turns it into a TooManyAttempts error).
 * The email is never counted on its own: then anyone could lock a member out by failing on purpose from elsewhere.
 * A successful sign-in clears that IP+email count. Kept apart from auth.ts so it can be tested without next-auth.
 */
export async function authorizeCredentials(c: Partial<Record<string, unknown>> | undefined, headers: Pick<Headers, "get"> | null, now = new Date()): Promise<Authorized | "limited" | null> {
  if (typeof c?.email !== "string" || typeof c?.password !== "string") return null;
  const email = normaliseEmail(c.email).slice(0, 200);
  const ip = clientIp(headers);
  // an unknown IP (no proxy header) is not counted: it would put every visitor in one bucket
  const ipOk = ip === "unknown" || await hit("login-ip", ip, LIMITS.loginIp, now);
  const pair = `${ip}|${email}`;
  const pairOk = await hit("login-ip-email", pair, LIMITS.loginIpEmail, now);
  if (!ipOk || !pairOk) {
    console.warn(`[auth] sign-in rate limited (${!ipOk ? "ip" : "ip+email"})`);
    return "limited";
  }
  const u = await verifyCredentials(email, c.password);
  if (!u) return null;
  await clearHits("login-ip-email", pair);
  return { id: u.id, email: u.email, name: u.name, sv: u.sessionVersion };
}
