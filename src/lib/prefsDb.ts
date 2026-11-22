import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { isLocale, isTheme, isTimeZone, parseLocale, parseTheme, parseTimeZone, type Prefs } from "./prefs";

export const prefsOf = (u: Pick<User, "locale" | "theme" | "timeZone">): Prefs => ({ locale: parseLocale(u.locale), theme: parseTheme(u.theme), timeZone: parseTimeZone(u.timeZone) });

/** Saves the fields that were sent. Anything unknown is refused and nothing is written. */
export async function savePrefs(userId: string, input: { locale?: unknown; theme?: unknown; timeZone?: unknown }): Promise<{ prefs?: Prefs; error?: "locale" | "theme" | "timeZone" | "user" }> {
  const set: Partial<Prefs> = {};
  if (input.locale !== undefined) {
    if (!isLocale(input.locale)) return { error: "locale" };
    set.locale = input.locale;
  }
  if (input.theme !== undefined) {
    if (!isTheme(input.theme)) return { error: "theme" };
    set.theme = input.theme;
  }
  if (input.timeZone !== undefined) {
    if (!isTimeZone(input.timeZone)) return { error: "timeZone" };
    set.timeZone = input.timeZone;
  }
  const rows = Object.keys(set).length
    ? await db.update(schema.users).set(set).where(eq(schema.users.id, userId)).returning()
    : await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return rows[0] ? { prefs: prefsOf(rows[0]) } : { error: "user" };
}
