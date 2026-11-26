"use server";
import { recordConsent } from "../legal";
import { referrerOf } from "../referral";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { createUser, findUserByEmail, normaliseEmail } from "../users";
import { LIMITS, hit, requestIp } from "../rateLimit";
import { mnT, type T } from "../i18n";
import type { Prefs } from "../prefs";
import { savePrefs } from "../prefsDb";

/** `prefs`: the language, theme and time zone the visitor was already using; the new account starts with them. */
export async function registerUser(form: FormData, t: T = mnT, prefs?: Prefs): Promise<{ error?: string }> {
  // The law on personal data: written (here electronic) consent before anything is stored.
  if (form.get("consent") !== "on") return { error: t("Нууцлалын бодлого, үйлчилгээний нөхцөлийг уншиж зөвшөөрнө үү", "Please read and accept the privacy policy and the terms") };
  // Attempts are counted per IP and per email. Sign-up still says when an email is taken (the visitor needs to
  // know to sign in instead); the limits make checking many addresses that way slow and visible in the logs.
  const ip = await requestIp();
  const rawEmail = form.get("email");
  const ipOk = ip === "unknown" || await hit("register-ip", ip, LIMITS.registerIp);
  const emailOk = typeof rawEmail !== "string" || await hit("register-email", normaliseEmail(rawEmail).slice(0, 200), LIMITS.registerEmail);
  if (!ipOk || !emailOk) {
    console.warn(`[auth] sign-up rate limited (${!ipOk ? "ip" : "email"})`);
    return { error: t("Хэт олон оролдлого хийлээ. Нэг цагийн дараа дахин оролдоно уу.", "Too many attempts. Try again in an hour.") };
  }
  const r = await createUser({ name: form.get("name"), email: form.get("email"), password: form.get("password") }, "USER", t);
  if (r.error) return r;
  const email = form.get("email");
  const created = typeof email === "string" ? await findUserByEmail(email) : null;
  if (created) {
    await recordConsent(created.id);
    const by = await referrerOf(form.get("ref"));
    if (by && by !== created.id) await db.update(schema.users).set({ referredBy: by }).where(eq(schema.users.id, created.id));
    if (prefs) await savePrefs(created.id, prefs);
  }
  return {};
}
