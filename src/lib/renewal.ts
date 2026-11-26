import { and, eq, gt, isNotNull, lte, ne, or, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { deliver, esc, siteUrl, telegramConfigured, telegramTiming } from "./telegram";
import { prefsOf } from "./prefsDb";
import { viewer } from "./viewer";
import { latestPaidPlan } from "./dashboard";
import { PLANS } from "./plans";

/** A Telegram reminder this many days before a plan ends, once per end date. */
export const REMIND_DAYS = 3;
const DAY = 864e5;
const SEND_GAP_MS = 40;

type Send = (chatId: string, html: string) => Promise<boolean>;

/**
 * Members (not admins) with Telegram linked and not paused, whose access ends within REMIND_DAYS, get one message
 * with the days left and a link to the plans. Each is claimed first (renewRemindedFor = the end it is about), so
 * two runners never send twice; a send that fails gives the claim back for the next run.
 */
export async function emitRenewalReminders(now: Date, opts: { send?: Send } = {}): Promise<number> {
  if (!opts.send && !telegramConfigured()) return 0;
  const send = opts.send ?? deliver;
  const u = schema.users;
  const claimed = await db.update(u).set({ renewRemindedFor: sql`${u.accessUntil}` })
    .where(and(
      eq(u.role, "USER"), isNotNull(u.telegramChatId), eq(u.signalsPaused, false),
      gt(u.accessUntil, now), lte(u.accessUntil, new Date(now.getTime() + REMIND_DAYS * DAY)),
      or(isNull(u.renewRemindedFor), ne(u.renewRemindedFor, u.accessUntil)),
    ))
    .returning();
  const base = siteUrl();
  let sent = 0;
  for (const m of claimed) {
    const v = viewer(prefsOf(m));
    const { t } = v;
    const days = Math.max(1, Math.ceil((m.accessUntil!.getTime() - now.getTime()) / DAY));
    const plan = await latestPaidPlan(m.id);
    const name = plan ? PLANS[plan].name : t("Таны", "Your");
    const link = base ? `<a href="${esc(`${base}/plans`)}">${esc(t("Багц сунгах", "Renew your plan"))}</a>` : "";
    const text = [
      t(`⏳ <b>${esc(name)} багц ${days} хоногийн дараа дуусна</b> (${esc(v.date(m.accessUntil!))}).`, `⏳ <b>${esc(name)} plan ends in ${days} day${days === 1 ? "" : "s"}</b> (${esc(v.date(m.accessUntil!))}).`),
      t("Одоо сунгавал үлдсэн хугацаан дээр нэмэгдэнэ, нэг ч өдөр алдагдахгүй.", "Renewing now adds to the time you have left, so no day is lost."),
      link,
    ].filter(Boolean).join("\n");
    try {
      if (await send(m.telegramChatId!, text)) sent++;
    } catch (err) {
      console.warn(`[renewal] could not remind one member: ${err instanceof Error ? err.message : err}`);
      await db.update(u).set({ renewRemindedFor: null }).where(eq(u.id, m.id)); // try again next run
    }
    await telegramTiming.sleep(SEND_GAP_MS);
  }
  return sent;
}
