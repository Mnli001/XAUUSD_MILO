import "./i18n.server";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, lt } from "drizzle-orm";
import { db, schema } from "./db";
import { hasAccess } from "./access";
import { ENTRY_FRESH_MS, getSetups, type Setup, type SetupsView } from "./setup/build";
import { deliver, deliverPhoto, esc, setupLink, siteUrl, telegramConfigured, telegramTiming } from "./telegram";
import { loadCandles, SYMBOL } from "./ingest/prices";
import { signalOutcome, type Outcome } from "./signalOutcome";
import { emitRenewalReminders } from "./renewal";
import { tradeChartPng } from "./tradeChart";
import type { Signal } from "./db/schema";
import type { Candle } from "./analysis/indicators";
import { wantsSignal } from "./account";
import { prefsOf } from "./prefsDb";
import { eventTitle } from "./data/calendarProvider";
import type { T } from "./i18n";
import { MN_VIEWER, viewer, type Viewer } from "./viewer";

const px = (v: number) => v.toFixed(2);
const usd = (v: number) => `$${v.toFixed(2)}`;
/**
 * A signal older than this when first seen (the job was down, or a run was missed) is recorded but not sent. The same
 * limit the robot gets (ENTRY_FRESH_MS in lib/setup/build): Telegram and the robot never disagree on what is fresh.
 */
const STALE_MS = ENTRY_FRESH_MS;
/**
 * sentTo of a signal that was recorded but never went out (too late, or only seen after it had already ended). Such
 * a signal is kept so the record is complete, but it is left out of the history, the totals, the weekly report and
 * the result messages: nobody could have acted on it.
 */
export const NOT_SENT = -1;
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
    ...(s.size && s.size !== 1 ? [s.size > 1
      ? t(`Тренд хүчтэй: лотоо ердийнхөөс ${s.size}× болгоно (робот өөрөө тооцно)`, `Strong trend: size this trade ${s.size}× your usual (the robot does it)`)
      : t(`Тренд сул: лотоо ердийнхөөс ${s.size}× болгоно (робот өөрөө тооцно)`, `Weak trend: size this trade ${s.size}× your usual (the robot does it)`)] : []),
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
  const today = now.toISOString().slice(0, 10);
  for (const s of view.setups) {
    if (!s.side || s.entry === null || s.stop === null || s.target === null) continue;
    // A live setup is a signal. So is a reading of today that already went active and ended (a missed run can take
    // it from WATCH straight to closed): it is recorded, marked not sent, so it never just vanishes.
    const live = s.status === "ACTIVE";
    if (!live && !(s.at && s.at.toISOString().slice(0, 10) === today)) continue;
    const at = s.at ?? view.lastCandleAt ?? now; // when the bar that made it active closed (for the message)
    const bar = s.at ?? now; // keyed by the bar, so two runners reading the same bar agree
    const key = `${s.id}:${bar.toISOString().slice(0, 10)}`; // each rule: once per UTC day
    const late = !live || now.getTime() - at.getTime() > STALE_MS;
    const [row] = await db.insert(schema.signals).values({ key, setupId: s.id, name: s.name, side: s.side, entry: s.entry, stop: s.stop, target: s.target, createdAt: late ? at : now, sentTo: late ? NOT_SENT : 0 }).onConflictDoNothing({ target: schema.signals.key }).returning({ id: schema.signals.id });
    if (!row) continue;
    created++;
    if (late) {
      console.warn(`[signals] ${s.id} went active at ${at.toISOString()}${live ? ", too long ago to send" : " and had already ended"}: recorded, not sent`);
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
        // With no test sender: the picture first (the setup and the expected move), then the full message.
        if (!opts.send) await deliverPhoto(chat, await signalPicture(theirs, (await reading(v)).candles, at, v), signalCaption(theirs, v)).catch(() => false);
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

const RESULT_LOOKBACK_MS = 3 * 864e5; // results are announced for signals up to three days old

/** The result message: what happened, in R and in dollars on 0.01 lot, with a link to the signal history. */
export function resultText(s: Pick<Signal, "side" | "name" | "entry" | "stop" | "target">, o: Outcome, v: Viewer = MN_VIEWER, base: string | null = siteUrl()): string {
  const { t } = v;
  const r = o.r ?? 0;
  const money = r * Math.abs(s.entry - s.stop) * LOT_OZ;
  const head = o.kind === "WIN" ? t("✅ <b>TP хүрлээ</b>", "✅ <b>Target hit</b>") : o.kind === "LOSS" ? t("❌ <b>SL хүрлээ</b>", "❌ <b>Stop hit</b>") : t("⏱ <b>Цагаар хаагдлаа</b>", "⏱ <b>Closed on time</b>");
  const exit = o.kind === "WIN" ? s.target : o.kind === "LOSS" ? s.stop : null;
  const link = base ? `<a href="${esc(`${base}/bot/history`)}">${esc(t("Дохионы түүхийг харах", "See the signal history"))}</a>` : "";
  return [
    `${head} · ${s.side} XAUUSD`,
    `<b>${esc(s.name)}</b>`,
    "",
    t(`Үр дүн: <b>${r > 0 ? "+" : ""}${r.toFixed(2)}R</b> (0.01 лот: ${money >= 0 ? "+" : "−"}${usd(Math.abs(money))})`, `Result: <b>${r > 0 ? "+" : ""}${r.toFixed(2)}R</b> (0.01 lot: ${money >= 0 ? "+" : "−"}${usd(Math.abs(money))})`),
    t(`Орсон ${px(s.entry)}${exit !== null ? ` → гарсан ${px(exit)}` : ""}${o.at ? ` · ${v.time(o.at)} (${esc(v.zone)})` : ""}`, `Entry ${px(s.entry)}${exit !== null ? ` → exit ${px(exit)}` : ""}${o.at ? ` · ${v.time(o.at)} (${esc(v.zone)})` : ""}`),
    ...(link ? ["", link] : []),
  ].join("\n");
}

/**
 * Announces how each recent signal ended (target, stop or time exit) once, with a picture of the trade,
 * to the same people who got the signal. A result Telegram could not deliver to anyone is tried again next run.
 */
export async function emitResults(now: Date, opts: { send?: (chat: string, png: Buffer | null, caption: string) => Promise<boolean>; bars?: Candle[] } = {}): Promise<number> {
  // Not for a signal that was never sent (NOT_SENT): a result for a signal nobody received tells them nothing.
  const pending = await db.select().from(schema.signals).where(and(isNull(schema.signals.resultSentAt), gte(schema.signals.sentTo, 0), gt(schema.signals.createdAt, new Date(now.getTime() - RESULT_LOOKBACK_MS)))).orderBy(asc(schema.signals.createdAt));
  if (pending.length === 0) return 0;
  const bars = opts.bars ?? (await loadCandles(SYMBOL, "15min", Math.ceil(RESULT_LOOKBACK_MS / (15 * 6e4)) + 200));
  const send = opts.send ?? deliverPhoto;
  let done = 0;
  for (const s of pending) {
    const o = signalOutcome(s, bars, now);
    if (o.kind === "OPEN") continue;
    // Claim it first, so two runners never both announce it.
    const [claimed] = await db.update(schema.signals).set({ resultSentAt: now }).where(and(eq(schema.signals.id, s.id), isNull(schema.signals.resultSentAt))).returning({ id: schema.signals.id });
    if (!claimed) continue;
    const exitPrice = o.kind === "WIN" ? s.target : o.kind === "LOSS" ? s.stop : bars.filter((b) => o.at && b.time.getTime() < o.at.getTime()).at(-1)?.close ?? s.entry;
    const pictures = new Map<string, Promise<Buffer | null>>();
    const picture = (v: Viewer) => {
      const key = `${v.locale}|${v.timeZone}`;
      if (!pictures.has(key)) {
        const { t } = v;
        const r = o.r ?? 0;
        pictures.set(key, tradeChartPng({
          bars, side: s.side === "SELL" ? "SELL" : "BUY", entry: s.entry, stop: s.stop, target: s.target, openedAt: s.createdAt,
          exit: o.at ? { at: o.at, price: exitPrice, kind: o.kind as "WIN" | "LOSS" | "TIME" } : null,
          title: `${o.kind === "WIN" ? t("TP хүрлээ", "Target hit") : o.kind === "LOSS" ? t("SL хүрлээ", "Stop hit") : t("Цагаар хаагдлаа", "Closed on time")} · ${s.side} XAUUSD`,
          subtitle: `${s.name} · ${t("орсон", "entry")} ${px(s.entry)} · stop ${px(s.stop)} · target ${px(s.target)}`,
          badge: { text: `${r > 0 ? "+" : ""}${r.toFixed(2)}R`, kind: o.kind as "WIN" | "LOSS" | "TIME" },
          clock: v.time,
        }));
      }
      return pictures.get(key)!;
    };
    const chats = new Set<string>();
    let sentTo = 0, failed = 0;
    for (const u of await linkedUsers()) {
      const chat = u.telegramChatId!;
      if (chats.has(chat) || !hasAccess(u, now) || !wantsSignal(u, s.setupId)) continue;
      chats.add(chat);
      const v = viewer(prefsOf(u));
      try { if (await send(chat, await picture(v), resultText(s, o, v))) sentTo++; } catch (e) { failed++; console.warn(`[results] could not send to one chat: ${e instanceof Error ? e.message : e}`); }
      await telegramTiming.sleep(SEND_GAP_MS);
    }
    if (failed > 0 && sentTo === 0) { await db.update(schema.signals).set({ resultSentAt: null }).where(eq(schema.signals.id, s.id)); continue; }
    done++;
  }
  return done;
}

/** The short line under a signal's picture; the full message follows it. */
export function signalCaption(s: Pick<Setup, "side" | "name">, v: Viewer = MN_VIEWER): string {
  const { t } = v;
  return `${s.side === "BUY" ? "🟢" : "🔴"} <b>${s.side} XAUUSD</b> · ${esc(s.name)} · ${esc(t("шинэ дохио", "new signal"))}`;
}

/** A new signal drawn: recent candles, entry, stop and target zones, and an arrow to the target across the hours ahead. */
export function signalPicture(s: Pick<Setup, "side" | "name" | "entry" | "stop" | "target">, candles: Candle[], at: Date, v: Viewer = MN_VIEWER): Promise<Buffer | null> {
  const { t } = v;
  if (!s.side || s.entry === null || s.stop === null || s.target === null || candles.length === 0) return Promise.resolve(null);
  const rr = Math.abs(s.target - s.entry) / Math.abs(s.entry - s.stop);
  return tradeChartPng({
    bars: candles, side: s.side, entry: s.entry, stop: s.stop, target: s.target, openedAt: at, exit: null,
    title: `${s.side} XAUUSD · ${t("шинэ дохио", "new signal")}`,
    subtitle: `${s.name} · ${t("орох", "entry")} ${px(s.entry)} · stop ${px(s.stop)} · target ${px(s.target)} · R:R 1:${rr.toFixed(1)}`,
    badge: null, clock: v.time,
    forecast: { label: t(`Таамаг: ${px(s.target)}`, `Expected: ${px(s.target)}`), ahead: t("дараагийн цагууд", "hours ahead") },
  });
}

/** What runs after each 5-minute price update. One part failing does not stop the other. */
export async function runTelegramJobs(now: Date, pricesOk: boolean): Promise<{ signals: number; news: number; results?: number; renewals?: number }> {
  const out: { signals: number; news: number; results?: number; renewals?: number } = { signals: 0, news: 0 };
  if (pricesOk) {
    try { out.signals = await emitSignals(now); } catch (err) { console.error("[signals] failed", err); }
    try { out.results = await emitResults(now); } catch (err) { console.error("[results] failed", err); }
  }
  try { out.news = await emitNewsAlerts(now); } catch (err) { console.error("[news] alerts failed", err); }
  try { out.renewals = await emitRenewalReminders(now); } catch (err) { console.error("[renewal] reminders failed", err); }
  return out;
}

/** The latest signals, newest first; with `before`, only those recorded before it. Signals never sent are left out unless asked for. */
export async function listSignals(limit: number, before?: Date, o: { includeUnsent?: boolean } = {}) {
  return db.select().from(schema.signals)
    .where(and(before ? lt(schema.signals.createdAt, before) : undefined, o.includeUnsent ? undefined : gte(schema.signals.sentTo, 0)))
    .orderBy(desc(schema.signals.createdAt)).limit(limit);
}
