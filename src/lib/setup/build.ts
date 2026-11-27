import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { Candle } from "../analysis/indicators";
import { SESSION_IDEAS, RECORD_BALANCE, ideaContext, ideaTrades } from "../bot/ideas";
import { loadBacktestData } from "../bot/run";
import { finalCandles, loadCandles, SYMBOL } from "../ingest/prices";
import { type SetupHistory, type SetupNow, historyOf, rangeSetup } from "./setups";
import { type SessionId, type SessionRule, SESSION_RULES, hourUtc } from "./sessionRules";
import { MN_VIEWER, type Viewer } from "../viewer";

export type Setup = SetupNow & {
  id: SessionId;
  name: string;
  rule: string; // the whole rule in a sentence or two
  history: SetupHistory; // every stored year
  recent: SetupHistory; // the last 12 months
};
/**
 * The Asian rule replayed in the MT5 Strategy Tester on one broker's own history: dated research, NOT the site's live
 * record and not what the site trades today. The run differs from the live rule: no news filter (release times do
 * not reach the tester), the robot's tester entry filter on, the broker's server-time candles, and all three session
 * tools run together. Kept beside the site's own replay so the short, strong period is not read as the whole story;
 * show it with `note` and `checkedOn` so it reads as a dated research result.
 */
export const BROKER_RECORD = {
  n: 209, winPct: 48, avgR: 0.212, profitFactor: 1.44, // the Asian rule with its 12:00 UTC entry window (scripts/asian-improve-research.ts)
  from: "2019-01", to: "2026-11", source: "JustMarkets XAUUSD", checkedOn: "2026-11-26",
  kind: "research" as const, // a tester result, not trades the site made
  method: "MT5 Strategy Tester, 1-minute OHLC, broker spread",
  note: "MT5 tester, 2019–2026, without the news filter", // the short English label (siteCopy BrokerRecord.note)
  noteText: { mn: "MT5 tester, 2019–2026, мэдээний шүүлтүүргүй, tester-ийн орох шүүлтүүртэй, broker-ын серверийн цагийн лаагаар. Судалгааны үр дүн, бодит арилжаа биш.", en: "MT5 tester, 2019–2026, without the news filter, with the tester's entry filter on, on the broker's server-time candles. A research result, not live trades." },
} as const;

export type SetupsView = { setups: Setup[]; candles: Candle[]; lastCandleAt: Date | null; historyFrom: Date | null };

const CHART_BARS = 128; // 32 hours of 15-minute candles
const YEAR = 365 * 864e5;
const RECORDS_TTL_MS = 6 * 36e5;
/** Live trend history: the replay reads 3000 daily and 10000 4-hour bars; EMA200 needs about five times its length to settle. */
export const LIVE_D1_BARS = 1000;
export const LIVE_H4_BARS = 2000;

type Records = { at: number; historyFrom: Date | null; rows: { all: SetupHistory; recent: SetupHistory }[] };
let records: Records | null = null;
export const clearSetupCache = () => { records = null; };

/** Replaying three years of candles is slow and changes little from hour to hour, so it is kept. */
async function getRecords(now: Date): Promise<Records> {
  if (records && Date.now() - records.at < RECORDS_TTL_MS) return records;
  const data = await loadBacktestData();
  const prepared = ideaContext(data);
  const since = now.getTime() - YEAR;
  const rows = SESSION_IDEAS.map((idea) => {
    const trades = data.m15.length ? ideaTrades(prepared, idea, RECORD_BALANCE) : [];
    return { all: historyOf(trades), recent: historyOf(trades.filter((t) => t.openedAt.getTime() >= since)) };
  });
  records = { at: Date.now(), historyFrom: prepared.ready >= 0 ? data.m15[prepared.ready].time : null, rows };
  return records;
}

/**
 * How long an entry stays valid after the 15-minute bar that made it closed: one rule for Telegram and the robot.
 * A signal older than this is recorded but not sent, and the robot is not handed it. The scheduler reads prices at
 * about one minute past each quarter hour, so a normal signal is one to two minutes old; 30 minutes allows one
 * missed run. The robot also refuses an order once price has run SLIP_R_MAX of the risk past the entry.
 */
export const ENTRY_FRESH_MS = 30 * 6e4;
export const SLIP_R_MAX = 0.3;

/**
 * A live setup as the robot's order. `id` is unique per rule and bar (rule index × 1e10 + the bar's close in unix
 * seconds); `legacyId` is the bar's close alone, the id robots before v3.70 remember. `entry`, `sl`, `tp` are the
 * setup's own prices; `risk` (= |entry − sl|) and `rr` are kept for robots that only take distances.
 */
export type AsianOrder = { id: number; legacyId: number; rule: SessionId; dir: 1 | -1; risk: number; rr: number; ageSec: number; exitAt?: number; entry: number; sl: number; tp: number };
let orderMemo: { at: number; orders: AsianOrder[] } | null = null;
const ORDER_TTL_MS = 20_000; // robots sync every second; the reading changes once per 15-minute candle
export const ORDER_ID_RULE_STEP = 1e10;

export function asianOrderOf(s: Pick<Setup, "status" | "side" | "entry" | "stop" | "target" | "at"> & { window?: SetupNow["window"]; id?: SessionId }, now: Date): AsianOrder | null {
  if (s.status !== "ACTIVE" || !s.side || s.entry === null || s.stop === null || s.target === null || !s.at) return null;
  const risk = Math.round(Math.abs(s.entry - s.stop) * 100) / 100;
  if (!(risk > 0)) return null;
  const rr = Math.round((Math.abs(s.target - s.entry) / Math.abs(s.entry - s.stop)) * 100) / 100;
  const rule: SessionId = s.id ?? "asian-breakout";
  const index = Math.max(0, SESSION_RULES.findIndex((r) => r.id === rule));
  const barSec = Math.round(s.at.getTime() / 1000);
  return {
    id: index * ORDER_ID_RULE_STEP + barSec, legacyId: barSec, rule, dir: s.side === "BUY" ? 1 : -1, risk, rr,
    ageSec: Math.max(0, Math.round((now.getTime() - s.at.getTime()) / 1000)), exitAt: s.window ? Math.round(s.window.exitAt.getTime() / 1000) : undefined,
    entry: Math.round(s.entry * 100) / 100, sl: Math.round(s.stop * 100) / 100, tp: Math.round(s.target * 100) / 100,
  };
}

/** Every live setup the robot may take now (each session's rule its own order), newest first; none older than ENTRY_FRESH_MS. */
export async function getAsianOrders(now: Date): Promise<AsianOrder[]> {
  if (!orderMemo || now.getTime() - orderMemo.at > ORDER_TTL_MS) {
    const view = await getSetups(now);
    const live = view.setups.filter((x) => x.status === "ACTIVE" && x.at).sort((a, b) => b.at!.getTime() - a.at!.getTime());
    orderMemo = { at: now.getTime(), orders: live.map((x) => asianOrderOf(x, now)).filter((o): o is AsianOrder => o !== null) };
  }
  return orderMemo.orders
    .map((o) => ({ ...o, ageSec: Math.max(0, Math.round(now.getTime() / 1000 - o.legacyId)) }))
    .filter((o) => o.ageSec * 1000 <= ENTRY_FRESH_MS);
}
/** The newest live order: what robots before v3.70 receive as dId/dDir/dRisk/dRR/dAge/dExit. */
export async function getAsianOrder(now: Date): Promise<AsianOrder | null> {
  return (await getAsianOrders(now))[0] ?? null;
}
export const clearAsianOrderMemo = () => { orderMemo = null; };

const ub8 = (h: number) => hourUtc((h + 8) % 24);
/** A rule's name and its whole text, on the viewer's clock. */
export function describe(rule: SessionRule, v: Viewer = MN_VIEWER): { name: string; rule: string } {
  const { t, ub, zone } = v;
  const at = (h: number) => ub(ub8(h));
  const name = rule.id === "asian-breakout" ? t("Азийн хүрээний breakout", "Asian range breakout")
    : rule.id === "ny-open-breakout" ? t(`Нью-Йоркийн нээлтийн breakout (${at(rule.rangeFrom)})`, `New York opening breakout (${at(rule.rangeFrom)})`)
    : t(`Нью-Йоркийн хоёр дахь цагийн breakout (${at(rule.rangeFrom)})`, `New York second-hour breakout (${at(rule.rangeFrom)})`);
  const hold = rule.exit === "same20" ? t(`${ub("04:00")} гэхэд хаана`, `closed by ${ub("04:00")}`) : t(`маргааш ${ub("15:00")} хүртэл барина (баасан гарагт ${ub("04:00")})`, `held until ${ub("15:00")} the next day (${ub("04:00")} on a Friday)`);
  return {
    name,
    rule: t(
      `${at(rule.rangeFrom)}–${at(rule.rangeTo)} (${zone}) цагийн хамгийн өндөр, нам үнэ хүрээг тогтооно. Өдөр, 4 цагийн trend нэг чиглэлд байвал ${at(rule.rangeTo)}–${at(rule.entryTo)} цагт хүрээнээс тэр чиглэлд гарсан эхний 15 минутын хаалтаар орно. Чухал мэдээний өмнөх 30, дараах 60 минутад орохгүй. Хүрээ өдрийн ATR-тай харьцуулахад хэт нарийн бол тэр өдөр орохгүй. Stop хүрээний дунд, target stop-оос ${rule.rr} дахин хол, аль нь ч хүрээгүй бол ${hold}. Өдөрт нэг арилжаа.`,
      `The highest and lowest price between ${at(rule.rangeFrom)} and ${at(rule.rangeTo)} (${zone}) set the range. When the daily and 4-hour trends point the same way, the first 15-minute close outside the range in that direction between ${at(rule.rangeTo)} and ${at(rule.entryTo)} is the entry. No entry from 30 minutes before to 60 minutes after an important release. If the range is too narrow against the daily ATR, the day is passed. The stop is the middle of the range, the target is ${rule.rr} times as far as the stop; if neither is hit the trade is ${hold}. One trade a day.`),
  };
}


/** The setup read against the latest stored candles (closed bars only), each with its rule's replayed record. */
export async function getSetups(now: Date, v: Viewer = MN_VIEWER): Promise<SetupsView> {
  const [rec, m15, h4, d1, events] = await Promise.all([
    getRecords(now),
    loadCandles(SYMBOL, "15min", 700),
    // Enough history for the trend scores' EMA200 to settle as it does in the replay (which reads every stored bar).
    loadCandles(SYMBOL, "4h", LIVE_H4_BARS),
    loadCandles(SYMBOL, "1day", LIVE_D1_BARS),
    db.select({ time: schema.economicEvents.time }).from(schema.economicEvents).where(eq(schema.economicEvents.impact, "HIGH")),
  ]);
  const news = events.map((e) => e.time);
  // A bar still forming decides nothing, and neither does a stored copy of a bar fetched before it closed (finalCandles).
  const closed = finalCandles(m15, "15min", now);
  const { ctx } = ideaContext({ m15: closed, h4: finalCandles(h4, "4h", now), d1: finalCandles(d1, "1day", now), news });
  const scores = { daily: ctx.daily.slice(-200), h4: ctx.h4.slice(-200), atrD: ctx.atrD.slice(-200) };
  const bars = closed.slice(-200);
  const yesterday = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
  const read = (rule: SessionRule) => {
    // A rule that holds overnight may still have yesterday's trade open before today's range: show that one while it is.
    const held = rule.exit === "next07" && now.getUTCHours() < 7 ? rangeSetup(rule, bars, scores, news, now, v, yesterday) : null;
    return held?.status === "ACTIVE" ? held : rangeSetup(rule, bars, scores, news, now, v);
  };
  return {
    setups: SESSION_RULES.map((rule, i) => ({ ...read(rule), id: rule.id, ...describe(rule, v), history: rec.rows[i].all, recent: rec.rows[i].recent })),
    candles: m15.slice(-CHART_BARS),
    lastCandleAt: m15.at(-1)?.time ?? null,
    historyFrom: rec.historyFrom,
  };
}
