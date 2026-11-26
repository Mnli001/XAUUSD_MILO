import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { Candle } from "../analysis/indicators";
import { SESSION_IDEAS, RECORD_BALANCE, ideaContext, ideaTrades } from "../bot/ideas";
import { loadBacktestData } from "../bot/run";
import { loadCandles, SYMBOL } from "../ingest/prices";
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
 * The rule replayed in the MT5 Strategy Tester on the broker's own history (JustMarkets XAUUSD.m, 1-minute OHLC,
 * the broker's spread), 2019-01 → 2026-11. A dated research result (scripts/broker-research.ts and the tester run),
 * shown beside the site's own replay so the short, strong period is not read as the whole story.
 */
export const BROKER_RECORD = { n: 209, winPct: 48, avgR: 0.212, profitFactor: 1.44, from: "2019-01", source: "JustMarkets XAUUSD", checkedOn: "2026-11-26" } as const; // the Asian rule with its 12:00 UTC entry window (scripts/asian-improve-research.ts)

export type SetupsView = { setups: Setup[]; candles: Candle[]; lastCandleAt: Date | null; historyFrom: Date | null };

const M15 = 15 * 6e4;
const CHART_BARS = 128; // 32 hours of 15-minute candles
const YEAR = 365 * 864e5;
const RECORDS_TTL_MS = 6 * 36e5;

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

/** The robot's Asian order: the same reading the Setup page and Telegram use, while it is live. */
export type AsianOrder = { id: number; dir: 1 | -1; risk: number; rr: number; ageSec: number; exitAt?: number };
let orderMemo: { at: number; order: AsianOrder | null } | null = null;
const ORDER_TTL_MS = 20_000; // robots sync every second; the reading changes once per 15-minute candle

export function asianOrderOf(s: Pick<Setup, "status" | "side" | "entry" | "stop" | "target" | "at"> & { window?: SetupNow["window"] }, now: Date): AsianOrder | null {
  if (s.status !== "ACTIVE" || !s.side || s.entry === null || s.stop === null || s.target === null || !s.at) return null;
  const risk = Math.round(Math.abs(s.entry - s.stop) * 100) / 100;
  if (!(risk > 0)) return null;
  const rr = Math.round((Math.abs(s.target - s.entry) / Math.abs(s.entry - s.stop)) * 100) / 100;
  return { id: Math.round(s.at.getTime() / 1000), dir: s.side === "BUY" ? 1 : -1, risk, rr, ageSec: Math.max(0, Math.round((now.getTime() - s.at.getTime()) / 1000)), exitAt: s.window ? Math.round(s.window.exitAt.getTime() / 1000) : undefined };
}

export async function getAsianOrder(now: Date): Promise<AsianOrder | null> {
  if (!orderMemo || now.getTime() - orderMemo.at > ORDER_TTL_MS) {
    const view = await getSetups(now);
    // The newest live setup of any session: the robot holds one trade at a time.
    const live = view.setups.filter((x) => x.status === "ACTIVE" && x.at).sort((a, b) => b.at!.getTime() - a.at!.getTime())[0];
    orderMemo = { at: now.getTime(), order: live ? asianOrderOf(live, now) : null };
  }
  const o = orderMemo.order;
  return o ? { ...o, ageSec: Math.max(0, Math.round(now.getTime() / 1000 - o.id)) } : null;
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
      `${at(rule.rangeFrom)}–${at(rule.rangeTo)} (${zone}) цагийн хамгийн өндөр, нам үнэ хүрээг тогтооно. Өдөр, 4 цагийн тренд нэг чиглэлд байвал ${at(rule.rangeTo)}–${at(rule.entryTo)} цагт хүрээнээс тэр чиглэлд гарсан эхний 15 минутын хаалтаар орно. Чухал мэдээний өмнөх 30, дараах 60 минутад орохгүй. Хүрээ өдрийн ATR-тай харьцуулахад хэт нарийн бол тэр өдөр орохгүй. Stop хүрээний дунд, target stop-оос ${rule.rr} дахин хол, аль нь ч хүрээгүй бол ${hold}. Өдөрт нэг арилжаа.`,
      `The highest and lowest price between ${at(rule.rangeFrom)} and ${at(rule.rangeTo)} (${zone}) set the range. When the daily and 4-hour trends point the same way, the first 15-minute close outside the range in that direction between ${at(rule.rangeTo)} and ${at(rule.entryTo)} is the entry. No entry from 30 minutes before to 60 minutes after an important release. If the range is too narrow against the daily ATR, the day is passed. The stop is the middle of the range, the target is ${rule.rr} times as far as the stop; if neither is hit the trade is ${hold}. One trade a day.`),
  };
}


/** The setup read against the latest stored candles (closed bars only), each with its rule's replayed record. */
export async function getSetups(now: Date, v: Viewer = MN_VIEWER): Promise<SetupsView> {
  const [rec, m15, h4, d1, events] = await Promise.all([
    getRecords(now),
    loadCandles(SYMBOL, "15min", 700),
    loadCandles(SYMBOL, "4h", 500),
    loadCandles(SYMBOL, "1day", 400),
    db.select({ time: schema.economicEvents.time }).from(schema.economicEvents).where(eq(schema.economicEvents.impact, "HIGH")),
  ]);
  const news = events.map((e) => e.time);
  const closed = m15.filter((c) => c.time.getTime() + M15 <= now.getTime()); // a bar still forming decides nothing
  const { ctx } = ideaContext({ m15: closed, h4, d1, news });
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
