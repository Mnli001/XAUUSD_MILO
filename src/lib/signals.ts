import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { db, schema } from "./db";
import { hasAccess } from "./access";
import { getSetups, type Setup, type SetupsView } from "./setup/build";
import { deliver, esc, setupLink, siteUrl, telegramConfigured, telegramTiming } from "./telegram";
import { wantsSignal } from "./account";
import { prefsOf } from "./prefsDb";
import { eventTitle } from "./data/calendarProvider";
import type { T } from "./i18n";
import { MN_VIEWER, viewer, type Viewer } from "./viewer";

const px = (v: number) => v.toFixed(2);
const usd = (v: number) => `$${v.toFixed(2)}`;
const STALE_MS = 60 * 6e4; // a setup that went active over an hour ago (the job was down) is recorded, not sent
const SEND_GAP_MS = 40; // about 25 messages a second, under Telegram's 30 a second
export const NEWS_LEAD_MS = 30 * 6e4; // the heads-up goes out up to 30 minutes before a HIGH-impact release
export const LOT_OZ = 1; // 0.01 lot of XAUUSD is 1 oz, so $1 of price is $1 of profit or loss

const notAdvice = (t: T) => `<i>${esc(t("Статистик, санхүүгийн зөвлөгөө биш.", "Statistics, not financial advice."))}</i>`;

/**
 * The Telegram message (HTML parse mode) for a setup that has just become active. `candleAt` is when
 * the bar that triggered it closed; `base` is the site's address for the Setup link.
 */
export function signalText(s: Setup, candleAt: Date | null, now: Date, v: Viewer = MN_VIEWER, base: string | null = siteUrl()): string {
  const { t } = v;
  const entry = s.entry!, stop = s.stop!, target = s.target!;
  const risk = Math.abs(entry - stop) * LOT_OZ;
  const reward = Math.abs(target - entry) * LOT_OZ;
  const rr = risk > 0 ? reward / risk : null;
  const h = s.history;
  const lag = candleAt ? Math.max(0, Math.round((now.getTime() - candleAt.getTime()) / 6e4)) : null;
  const buy = s.side === "BUY";
  const side = buy ? t("🟢 <b>BUY · АВАХ</b>", "🟢 <b>BUY</b>") : t("🔴 <b>SELL · ЗАРАХ</b>", "🔴 <b>SELL</b>");
  const avg = h.avgR === null ? "" : `${h.avgR > 0 ? "+" : ""}${h.avgR.toFixed(2)}R`;
  const link = setupLink(t, base);
  return [
    `${side} XAUUSD`,
    `<b>${esc(s.name)}</b>`,
    "",
    t(`Орох: <b>${px(entry)}</b> орчим`, `Entry: around <b>${px(entry)}</b>`),
    `Stop: <b>${px(stop)}</b>`,
    `Target: <b>${px(target)}</b>`,
    t(`0.01 лот: эрсдэл ${usd(risk)}, ашиг ${usd(reward)}${rr === null ? "" : ` · R:R 1 : ${rr.toFixed(1)}`}`, `0.01 lot: risk ${usd(risk)}, reward ${usd(reward)}${rr === null ? "" : ` · R:R 1 : ${rr.toFixed(1)}`}`),
    "",
    ...s.checks.filter((c) => c.ok).map((c) => `✓ ${esc(c.label)}`),
    "",
    h.winPct === null
      ? t(`Түүхэн үр дүн: дата хангалтгүй (${h.n} арилжаа)`, `Historical record: not enough data (${h.n} trades)`)
      : t(`Түүхэн үр дүн: ${h.n} арилжаа, ${h.winPct}% ашигтай, дундаж ${avg}`, `Historical record: ${h.n} trades, ${h.winPct}% profitable, average ${avg}`),
    candleAt === null || lag === null
      ? t("Орохын өмнө MT5 дээрх одоогийн үнээ шалгаарай.", "Check the current price on MT5 before entering.")
      : t(`🕒 ${v.time(candleAt)} (${esc(v.zone)}) лаа, ${lag} минутын өмнө. Орохын өмнө MT5 дээрх үнээ шалгаарай.`, `🕒 ${v.time(candleAt)} (${esc(v.zone)}) candle, ${lag} minutes ago. Check the price on MT5 before entering.`),
    ...(link ? [link] : []),
    notAdvice(t),
  ].filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== "")).join("\n");
}

type Send = (chatId: string, text: string) => Promise<boolean>;

/** Linked users, oldest account first, so a shared chat is always answered for the same account. */
const linkedUsers = () => db.select().from(schema.users).where(isNotNull(schema.users.telegramChatId)).orderBy(asc(schema.users.createdAt));

/**
 * Looks at the setups, records each newly active one once, and sends it to every user who has
 * linked Telegram, still has access and wants it. Returns how many new signals there were.
 * When Telegram failed for every recipient, the record is dropped so the next 5-minute run tries again.
 */
export async function emitSignals(now: Date, opts: { view?: SetupsView; viewFor?: (v: Viewer) => Promise<SetupsView>; send?: Send } = {}): Promise<number> {
  const view = opts.view ?? (await getSetups(now));
  const send = opts.send ?? deliver;
  // The same reading in another language or on another clock, built once per kind of reader.
  const viewFor = opts.viewFor ?? (opts.view ? null : (v: Viewer) => getSetups(now, v));
  const readings = new Map<string, Promise<SetupsView>>([[`${MN_VIEWER.locale}|${MN_VIEWER.timeZone}`, Promise.resolve(view)]]);
  const reading = (v: Viewer): Promise<SetupsView> => {
    const key = `${v.locale}|${v.timeZone}`;
    if (!readings.has(key)) readings.set(key, viewFor ? viewFor(v).catch(() => view) : Promise.resolve(view));
    return readings.get(key)!;
  };
  let created = 0;
  for (const s of view.setups) {
    if (s.status !== "ACTIVE" || !s.side || s.entry === null || s.stop === null || s.target === null) continue;
    const at = s.at ?? view.lastCandleAt ?? now; // when the bar that made it active closed (for the message)
    const bar = s.at ?? now; // keyed by the bar, so two runners reading the same bar agree
    const key = `${s.id}:${bar.toISOString().slice(0, 10)}`; // the Asian breakout: once per UTC day
    const [row] = await db.insert(schema.signals).values({ key, setupId: s.id, name: s.name, side: s.side, entry: s.entry, stop: s.stop, target: s.target, createdAt: now }).onConflictDoNothing({ target: schema.signals.key }).returning({ id: schema.signals.id });
    if (!row) continue;
    created++;
    if (now.getTime() - at.getTime() > STALE_MS) {
      console.warn(`[signals] ${s.id} went active at ${at.toISOString()}, too long ago to send`);
      continue;
    }
    const chats = new Set<string>();
    let sentTo = 0, failed = 0;
    for (const u of await linkedUsers()) {
      const chat = u.telegramChatId!;
      if (chats.has(chat) || !hasAccess(u, now) || !wantsSignal(u, s.id)) continue;
      chats.add(chat);
      const v = viewer(prefsOf(u));
      const theirs = (await reading(v)).setups.find((x) => x.id === s.id && x.status === "ACTIVE") ?? s;
      try {
        if (await send(chat, signalText(theirs, at, now, v))) sentTo++;
      } catch (e) {
        failed++;
        console.warn(`[signals] could not send to one chat: ${e instanceof Error ? e.message : e}`);
      }
      await telegramTiming.sleep(SEND_GAP_MS);
    }
    if (failed > 0 && sentTo === 0) {
      await db.delete(schema.signals).where(eq(schema.signals.id, row.id));
      created--;
      continue;
    }
    await db.update(schema.signals).set({ sentTo }).where(eq(schema.signals.id, row.id));
  }
  return created;
}

type NewsItem = { time: Date; title: string; type: string };

/** The "news soon" heads-up (HTML) for one or more HIGH-impact releases due shortly. */
export function newsText(events: NewsItem[], now: Date, v: Viewer = MN_VIEWER): string {
  const { t } = v;
  const mins = Math.max(1, Math.round((events[0].time.getTime() - now.getTime()) / 6e4));
  return [
    t(`⚠️ <b>${mins} минутын дараа чухал мэдээ</b>`, `⚠️ <b>Important release in ${mins} minutes</b>`),
    ...events.map((e) => `${v.time(e.time)} (${esc(v.zone)}) · ${esc(eventTitle(e, t))}`),
    "",
    esc(t("Мэдээний өмнөх 30, дараах 60 минутад setup шинээр ордоггүй. Үнэ огцом хөдөлж, spread тэлж магадгүй.", "Setups do not enter from 30 minutes before to 60 minutes after a release. Price can jump and spreads can widen.")),
    notAdvice(t),
  ].join("\n");
}

/**
 * Sends the heads-up once per release to users who opted in (and have not paused signals), up to
 * NEWS_LEAD_MS before it. Releases at the same moment go in one message. Returns how many releases were announced.
 */
export async function emitNewsAlerts(now: Date, opts: { send?: Send } = {}): Promise<number> {
  if (!opts.send && !telegramConfigured()) return 0;
  const send = opts.send ?? deliver;
  const e = schema.economicEvents;
  // claiming by update makes a second runner find nothing to send
  const claimed = await db.update(e).set({ alertedAt: now })
    .where(and(eq(e.impact, "HIGH"), isNull(e.alertedAt), gt(e.time, now), lte(e.time, new Date(now.getTime() + NEWS_LEAD_MS))))
    .returning({ id: e.id, time: e.time, title: e.title, type: e.type });
  if (!claimed.length) return 0;
  claimed.sort((a, b) => a.time.getTime() - b.time.getTime());
  const chats = new Set<string>();
  let sent = 0, failed = 0;
  for (const u of await linkedUsers()) {
    const chat = u.telegramChatId!;
    if (chats.has(chat) || !u.signalsNews || u.signalsPaused || !hasAccess(u, now)) continue;
    chats.add(chat);
    try {
      if (await send(chat, newsText(claimed, now, viewer(prefsOf(u))))) sent++;
    } catch (err) {
      failed++;
      console.warn(`[news] could not send to one chat: ${err instanceof Error ? err.message : err}`);
    }
    await telegramTiming.sleep(SEND_GAP_MS);
  }
  if (failed > 0 && sent === 0) {
    await db.update(e).set({ alertedAt: null }).where(inArray(e.id, claimed.map((c) => c.id))); // Telegram was down: try again next run
    return 0;
  }
  return claimed.length;
}

/** What runs after each 5-minute price update. One part failing does not stop the other. */
export async function runTelegramJobs(now: Date, pricesOk: boolean): Promise<{ signals: number; news: number }> {
  const out = { signals: 0, news: 0 };
  if (pricesOk) {
    try { out.signals = await emitSignals(now); } catch (err) { console.error("[signals] failed", err); }
  }
  try { out.news = await emitNewsAlerts(now); } catch (err) { console.error("[news] alerts failed", err); }
  return out;
}

export async function listSignals(limit: number) {
  return db.select().from(schema.signals).orderBy(desc(schema.signals.createdAt)).limit(limit);
}
