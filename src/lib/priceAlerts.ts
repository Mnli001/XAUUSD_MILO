import "./i18n.server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { PriceAlert } from "./db/schema";
import { deliver, esc } from "./telegram";
import { sendPush, type PushMessage } from "./push";
import { prefsOf } from "./prefsDb";
import { MN_VIEWER, viewer, type Viewer } from "./viewer";
import { GOLD, digitsOf, fmtPrice } from "./marketList";

/**
 * Price alerts: "tell me when gold reaches 3,620". Each fires once, the first time the price reaches the level from
 * the side it was on when the alert was set, and is then kept as history. Checked on every live price from the
 * robot and on every closed 15-minute candle, so it still fires when the robot is offline (up to 15 minutes late).
 */

export const MAX_ACTIVE_ALERTS = 10;
/** A level further than this from the current price is a typo, not a plan. */
const MAX_DISTANCE = 0.2;
const HISTORY = 5;


export type AlertError = "level" | "limit" | "price";

export async function createPriceAlert(userId: string, level: number, price: number | null, now: Date, symbol: string = GOLD): Promise<{ alert?: PriceAlert; error?: AlertError }> {
  if (price === null || !(price > 0)) return { error: "price" };
  if (!Number.isFinite(level) || level <= 0 || Math.abs(level - price) / price > MAX_DISTANCE) return { error: "level" };
  const k = 10 ** digitsOf(symbol);
  const rounded = Math.round(level * k) / k;
  if (rounded === Math.round(price * k) / k) return { error: "level" };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.priceAlerts).where(and(eq(schema.priceAlerts.userId, userId), isNull(schema.priceAlerts.triggeredAt)));
  if (n >= MAX_ACTIVE_ALERTS) return { error: "limit" };
  const [alert] = await db.insert(schema.priceAlerts).values({ userId, symbol, level: rounded, direction: rounded > price ? "above" : "below", createdAt: now }).returning();
  return { alert };
}

export async function deletePriceAlert(userId: string, id: string): Promise<void> {
  await db.delete(schema.priceAlerts).where(and(eq(schema.priceAlerts.id, id), eq(schema.priceAlerts.userId, userId)));
}

/** One instrument's waiting alerts (nearest level first is left to the page), then the last few that fired. */
export async function listPriceAlerts(userId: string, symbol: string = GOLD): Promise<PriceAlert[]> {
  const rows = await db.select().from(schema.priceAlerts).where(and(eq(schema.priceAlerts.userId, userId), eq(schema.priceAlerts.symbol, symbol))).orderBy(desc(schema.priceAlerts.createdAt));
  const waiting = rows.filter((r) => !r.triggeredAt);
  const fired = rows.filter((r) => r.triggeredAt).sort((a, b) => b.triggeredAt!.getTime() - a.triggeredAt!.getTime()).slice(0, HISTORY);
  return [...waiting, ...fired];
}

/** The Telegram message (HTML) when an alert fires. */
export function alertText(a: Pick<PriceAlert, "level" | "direction" | "createdAt"> & { symbol?: string }, price: number, at: Date, v: Viewer = MN_VIEWER): string {
  const { t } = v;
  const sym = a.symbol ?? GOLD;
  const px = (n: number) => fmtPrice(n, sym);
  return [
    t(`🔔 <b>${sym} ${px(a.level)}-д хүрлээ</b>`, `🔔 <b>${sym} reached ${px(a.level)}</b>`),
    t(`Үнэ: ${px(price)} · ${v.time(at)} (${esc(v.zone)})`, `Price: ${px(price)} · ${v.time(at)} (${esc(v.zone)})`),
    t(`${v.dateTime(a.createdAt)}-нд тавьсан сэрэмжлүүлэг.`, `The alert you set on ${v.dateTime(a.createdAt)}.`),
  ].join("\n");
}

export function alertPush(a: Pick<PriceAlert, "id" | "level"> & { symbol?: string }, price: number, v: Viewer = MN_VIEWER): PushMessage {
  const { t } = v;
  const sym = a.symbol ?? GOLD;
  const px = (n: number) => fmtPrice(n, sym);
  return { title: t(`🔔 ${sym} ${px(a.level)}-д хүрлээ`, `🔔 ${sym} reached ${px(a.level)}`), body: t(`Үнэ одоо ${px(price)}`, `Price now ${px(price)}`), url: sym === GOLD ? "/today#alerts" : `/markets?s=${sym}#alerts`, tag: `alert-${a.id}` };
}

type Deps = { send?: (chat: string, html: string) => Promise<boolean>; push?: (userId: string, msg: PushMessage) => Promise<number> };
/** A price range seen at `at`. `from` is when that range began (a candle's open); alerts set after it are left for the next one. */
export type Seen = { high: number; low: number; price: number; at: Date; from?: Date; symbol?: string };

/**
 * Fires every waiting alert the range reached, for users who still have a plan (an admin always does). Each alert is
 * claimed by one UPDATE, so the live price and the candle check never both announce it. Returns how many fired.
 */
export async function checkPriceAlerts(seen: Seen, deps: Deps = {}): Promise<number> {
  const send = deps.send ?? deliver;
  const push = deps.push ?? sendPush;
  const a = schema.priceAlerts;
  const since = seen.from ?? seen.at;
  const fired = await db.update(a).set({ triggeredAt: seen.at, triggeredPrice: seen.price })
    .where(and(
      isNull(a.triggeredAt),
      eq(a.symbol, seen.symbol ?? GOLD),
      sql`${a.createdAt} <= ${since}`,
      sql`((${a.direction} = 'above' AND ${a.level} <= ${seen.high}) OR (${a.direction} = 'below' AND ${a.level} >= ${seen.low}))`,
      sql`${a.userId} IN (SELECT id FROM users WHERE role = 'ADMIN' OR access_until > ${seen.at})`,
    ))
    .returning();
  for (const alert of fired) {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, alert.userId)).limit(1);
    if (!u) continue;
    const v = viewer(prefsOf(u));
    if (u.telegramChatId) await send(u.telegramChatId, alertText(alert, seen.price, seen.at, v)).catch((e) => console.warn(`[alerts] Telegram failed: ${e instanceof Error ? e.message : e}`));
    await push(u.id, alertPush(alert, seen.price, v)).catch((e) => console.warn(`[alerts] push failed: ${e instanceof Error ? e.message : e}`));
  }
  return fired.length;
}

let running = false;
/** For each live price: one check at a time, so a burst of prices never queues up work. */
export function watchTick(price: number, at: Date): void {
  if (running) return;
  running = true;
  checkPriceAlerts({ high: price, low: price, price, at })
    .then((n) => { if (n) console.log(`[alerts] ${n} price alert(s) fired at ${price}`); })
    .catch((e) => console.error("[alerts] check failed", e))
    .finally(() => { running = false; });
}
