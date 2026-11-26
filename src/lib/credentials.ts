import { normaliseEmail, verifyCredentials } from "./users";
import { LIMITS, clearHits, clientIp, hit } from "./rateLimit";

export type Authorized = { id: string; email: string; name: string; sv: number };

/**
 * The credentials check behind sign-in, with attempts counted per IP and per email (DB-backed, see rateLimit.ts).
 * Over either limit: "limited", before bcrypt runs (auth.ts turns it into a TooManyAttempts error).
 * A successful sign-in clears that email's count. Kept apart from auth.ts so it can be tested without next-auth.
 */
export async function authorizeCredentials(c: Partial<Record<string, unknown>> | undefined, headers: Pick<Headers, "get"> | null, now = new Date()): Promise<Authorized | "limited" | null> {
  if (typeof c?.email !== "string" || typeof c?.password !== "string") return null;
  const email = normaliseEmail(c.email).slice(0, 200);
  const ip = clientIp(headers);
  // an unknown IP (no proxy header) is not counted: it would put every visitor in one bucket
  const ipOk = ip === "unknown" || await hit("login-ip", ip, LIMITS.loginIp, now);
  const emailOk = await hit("login-email", email, LIMITS.loginEmail, now);
  if (!ipOk || !emailOk) {
    console.warn(`[auth] sign-in rate limited (${!ipOk ? "ip" : "email"})`);
    return "limited";
  }
  const u = await verifyCredentials(email, c.password);
  if (!u) return null;
  await clearHits("login-email", email);
  return { id: u.id, email: u.email, name: u.name, sv: u.sessionVersion };
}
