import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { deliver, esc, telegramConfigured } from "./telegram";
import { prefsOf } from "./prefsDb";
import { viewer } from "./viewer";
import { REFERRAL_DAYS } from "./referral";

/** A Telegram note to the inviter that a friend paid and their days were added. Best effort. */
export async function notifyReferrer(userId: string): Promise<void> {
  if (!telegramConfigured()) return;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u?.telegramChatId || u.signalsPaused) return;
  const v = viewer(prefsOf(u));
  const until = u.accessUntil ? esc(v.date(u.accessUntil)) : "";
  await deliver(u.telegramChatId, v.t(
    `🎁 <b>Таны урьсан найз багц авлаа.</b> Танд +${REFERRAL_DAYS} хоног нэмэгдлээ${until ? `, эрх ${until} хүртэл` : ""}.`,
    `🎁 <b>A friend you invited bought a plan.</b> You got +${REFERRAL_DAYS} days${until ? `, access until ${until}` : ""}.`,
  ));
}
