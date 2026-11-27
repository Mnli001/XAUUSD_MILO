import "./i18n.server";
import { and, asc, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db, schema } from "./db";
import { hasAccess } from "./access";
import { wantsSignal } from "./account";
import { prefsOf } from "./prefsDb";
import { deliver, esc, siteUrl } from "./telegram";
import { loadCandles, SYMBOL } from "./ingest/prices";
import { signalOutcome, outcomeTotals } from "./signalOutcome";
import { relativeText } from "./relativeTime";
import { viewer, MN_VIEWER, type Viewer } from "./viewer";

/**
 * Background watches that keep the service honest: a weekly results report to subscribers,
 * and an alert to the admins when the price feed stops (signals cannot fire without prices).
 */
const M15 = 15 * 6e4;
export const FEED_LATE_MS = 90 * 6e4;

/** Gold trades from Sunday 22:00 to Friday 21:00 UTC; outside that, quiet prices are normal. */
export function marketOpen(now: Date): boolean {
  const d = now.getUTCDay(), h = now.getUTCHours();
  if (d === 6) return false;
  if (d === 0) return h >= 22;
  if (d === 5) return h < 21;
  return true;
}

/**
 * The first hour after the weekly reopen, when no new candle yet is normal: the market reopens Sunday 22:00 UTC in
 * the northern summer and 23:00 UTC in winter, and the first bars can take a while to arrive. Counted from 22:00, so
 * the quiet window runs to Monday 00:00 UTC, which covers the winter open plus an hour.
 */
export function justReopened(now: Date): boolean {
  const d = now.getUTCDay(), h = now.getUTCHours();
  return d === 0 && h >= 22;
}

async function getState(key: string): Promise<string | null> {
  const [row] = await db.select().from(schema.appState).where(eq(schema.appState.key, key)).limit(1);
  return row?.value ?? null;
}
/** Sets a key only if it is not there yet; true when this call set it (so two runners never both act). */
async function claim(key: string, value: string, now: Date): Promise<boolean> {
  const rows = await db.insert(schema.appState).values({ key, value, updatedAt: now }).onConflictDoNothing({ target: schema.appState.key }).returning({ key: schema.appState.key });
  return rows.length > 0;
}
const drop = (key: string) => db.delete(schema.appState).where(eq(schema.appState.key, key));

const admins = () => db.select().from(schema.users).where(and(eq(schema.users.role, "ADMIN"), isNotNull(schema.users.telegramChatId)));

/** Tells the admins once when 15-minute candles stop arriving on a trading day, and once more when they are back. */
export async function watchFeed(now: Date, send: (chat: string, html: string) => Promise<boolean> = deliver): Promise<"late" | "back" | null> {
  const [last] = await loadCandles(SYMBOL, "15min", 1);
  const lateBy = last ? now.getTime() - (last.time.getTime() + M15) : Infinity;
  const late = marketOpen(now) && !justReopened(now) && lateBy > FEED_LATE_MS;
  const raised = await getState("feed_alert");
  if (late && !raised) {
    if (!(await claim("feed_alert", now.toISOString(), now))) return null;
    for (const a of await admins()) {
      const { t } = viewer(prefsOf(a));
      await send(a.telegramChatId!, t(`⚠️ <b>Үнийн дата хоцорч байна</b>\nСүүлийн 15 минутын лаа ${esc(relativeText(-lateBy, t))} хаагдсан. Энэ хооронд дохио гарахгүй. Twelve Data түлхүүр, лимитийг шалгана уу.`, `⚠️ <b>Prices are late</b>\nThe last 15-minute candle closed ${esc(relativeText(-lateBy, t))}. No signals can fire until prices return. Check the Twelve Data key and limits.`)).catch(() => false);
    }
    return "late";
  }
  if (!late && raised && last && lateBy <= FEED_LATE_MS) {
    await drop("feed_alert");
    for (const a of await admins()) {
      const { t } = viewer(prefsOf(a));
      await send(a.telegramChatId!, t("✅ Үнийн дата дахин ирж байна.", "✅ Prices are arriving again.")).catch(() => false);
    }
    return "back";
  }
  return null;
}

/** The ISO week, "2026-W48", of a date (Monday first). */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(week).padStart(2, "0")}`;
}

/** The weekly report text: last week's signals and how they ended, then the running total since the start. */
export function weeklyText(week: { kind: string; r: number | null }[], all: { kind: string; r: number | null }[], v: Viewer = MN_VIEWER, base: string | null = siteUrl()): string {
  const { t } = v;
  const w = outcomeTotals(week as never), a = outcomeTotals(all as never);
  const sign = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(2)}R`;
  const link = base ? `<a href="${esc(`${base}/bot/history`)}">${esc(t("Дохионы түүх", "Signal history"))}</a>` : "";
  return [
    t("📊 <b>7 хоногийн тайлан · XAUUSD</b>", "📊 <b>Weekly report · XAUUSD</b>"),
    "",
    week.length === 0
      ? t("Өнгөрсөн 7 хоногт дохио гараагүй (нөхцөл бүрдээгүй өдрүүдэд систем арилжаа хийхгүй).", "No signals last week (the system stays out on days its conditions are not met).")
      : t(`Өнгөрсөн 7 хоног: ${week.length} дохио · ашигтай ${w.wins} · алдагдалтай ${w.losses}${w.open ? ` · нээлттэй ${w.open}` : ""} · нийт <b>${sign(w.totalR)}</b>`, `Last week: ${week.length} signals · won ${w.wins} · lost ${w.losses}${w.open ? ` · open ${w.open}` : ""} · total <b>${sign(w.totalR)}</b>`),
    a.closed > 0 ? t(`Эхнээс нь: ${a.closed} арилжаа · ${a.winPct}% ашигтай · нийт <b>${sign(a.totalR)}</b>`, `Since the start: ${a.closed} trades · ${a.winPct}% profitable · total <b>${sign(a.totalR)}</b>`) : "",
    ...(link ? ["", link] : []),
  ].filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n");
}

/** Monday from 01:00 UTC (09:00 Ulaanbaatar): the weekly report, once per week, to everyone who gets signals. */
export async function sendWeeklyReport(now: Date, send: (chat: string, html: string) => Promise<boolean> = deliver): Promise<number> {
  if (now.getUTCDay() !== 1 || now.getUTCHours() < 1) return 0;
  const key = `weekly:${isoWeek(now)}`;
  if (await getState(key)) return 0;
  if (!(await claim(key, now.toISOString(), now))) return 0;
  // Only signals that went out: one recorded but never sent (NOT_SENT) is no part of anyone's results.
  const all = await db.select().from(schema.signals).where(gte(schema.signals.sentTo, 0)).orderBy(asc(schema.signals.createdAt));
  if (all.length === 0) return 0;
  const bars = await loadCandles(SYMBOL, "15min", Math.min(40_000, Math.ceil((now.getTime() - all[0].createdAt.getTime()) / M15) + 8));
  const outcomes = all.map((s) => ({ s, o: signalOutcome(s, bars, now) }));
  const since = now.getTime() - 7 * 864e5;
  const week = outcomes.filter((x) => x.s.createdAt.getTime() >= since).map((x) => x.o);
  const users = await db.select().from(schema.users).where(isNotNull(schema.users.telegramChatId)).orderBy(desc(schema.users.createdAt));
  let sent = 0;
  const chats = new Set<string>();
  for (const u of users) {
    const chat = u.telegramChatId!;
    if (chats.has(chat) || !hasAccess(u, now) || !["asian-breakout", "ny-open-breakout", "ny-late-breakout"].some((id) => wantsSignal(u, id))) continue;
    chats.add(chat);
    if (await send(chat, weeklyText(week, outcomes.map((x) => x.o), viewer(prefsOf(u)))).catch(() => false)) sent++;
  }
  return sent;
}
