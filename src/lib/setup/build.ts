import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { Candle } from "../analysis/indicators";
import { ASIAN_IDEA, RECORD_BALANCE, ideaContext, ideaTrades } from "../bot/ideas";
import { loadBacktestData } from "../bot/run";
import { loadCandles, SYMBOL } from "../ingest/prices";
import { type SetupHistory, type SetupNow, ASIAN_RR, asianSetup, historyOf } from "./setups";
import { MN_VIEWER, type Viewer } from "../viewer";

export type Setup = SetupNow & {
  id: "asian-breakout";
  name: string;
  rule: string; // the whole rule in a sentence or two
  history: SetupHistory; // every stored year
  recent: SetupHistory; // the last 12 months
};
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
  const rows = [ASIAN_IDEA].map((idea) => {
    const trades = data.m15.length ? ideaTrades(prepared, idea, RECORD_BALANCE) : [];
    return { all: historyOf(trades), recent: historyOf(trades.filter((t) => t.openedAt.getTime() >= since)) };
  });
  records = { at: Date.now(), historyFrom: prepared.ready >= 0 ? data.m15[prepared.ready].time : null, rows };
  return records;
}

/** The robot's Asian order: the same reading the Setup page and Telegram use, while it is live. */
export type AsianOrder = { id: number; dir: 1 | -1; risk: number; rr: number; ageSec: number };
let orderMemo: { at: number; order: AsianOrder | null } | null = null;
const ORDER_TTL_MS = 20_000; // robots sync every second; the reading changes once per 15-minute candle

export function asianOrderOf(s: Pick<Setup, "status" | "side" | "entry" | "stop" | "at">, now: Date): AsianOrder | null {
  if (s.status !== "ACTIVE" || !s.side || s.entry === null || s.stop === null || !s.at) return null;
  const risk = Math.round(Math.abs(s.entry - s.stop) * 100) / 100;
  if (!(risk > 0)) return null;
  return { id: Math.round(s.at.getTime() / 1000), dir: s.side === "BUY" ? 1 : -1, risk, rr: ASIAN_RR, ageSec: Math.max(0, Math.round((now.getTime() - s.at.getTime()) / 1000)) };
}

export async function getAsianOrder(now: Date): Promise<AsianOrder | null> {
  if (!orderMemo || now.getTime() - orderMemo.at > ORDER_TTL_MS) {
    const view = await getSetups(now);
    const s = view.setups.find((x) => x.id === "asian-breakout");
    orderMemo = { at: now.getTime(), order: s ? asianOrderOf(s, now) : null };
  }
  const o = orderMemo.order;
  return o ? { ...o, ageSec: Math.max(0, Math.round(now.getTime() / 1000 - o.id)) } : null;
}
export const clearAsianOrderMemo = () => { orderMemo = null; };

/** The setup read against the latest stored candles (closed bars only), each with its rule's replayed record. */
export async function getSetups(now: Date, v: Viewer = MN_VIEWER): Promise<SetupsView> {
  const { t, ub, zone } = v;
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
  const asian = asianSetup(closed.slice(-200), { daily: ctx.daily.slice(-200), h4: ctx.h4.slice(-200) }, news, now, v);
  return {
    setups: [
      { ...asian, id: "asian-breakout", name: t("Азийн хүрээний breakout", "Asian range breakout"), history: rec.rows[0].all, recent: rec.rows[0].recent,
        rule: t(`${ub("08:00")}–${ub("15:00")} (${zone}) цагийн хамгийн өндөр, нам үнэ хүрээг тогтооно. Өдөр, 4 цагийн тренд нэг чиглэлд байвал ${ub("15:00")}–${ub("00:00")} цагт хүрээнээс тэр чиглэлд гарсан эхний 15 минутын хаалтаар орно. Чухал мэдээний өмнөх 30, дараах 60 минутад орохгүй. Stop хүрээний дунд, target stop-оос ${ASIAN_RR} дахин хол, ${ub("04:00")} гэхэд хаана. Өдөрт нэг арилжаа.`, `The highest and lowest price between ${ub("08:00")} and ${ub("15:00")} (${zone}) set the range. When the daily and 4-hour trends point the same way, the first 15-minute close outside the range in that direction between ${ub("15:00")} and ${ub("00:00")} is the entry. No entry from 30 minutes before to 60 minutes after an important release. The stop is the middle of the range, the target is ${ASIAN_RR} times as far as the stop, and the trade is closed by ${ub("04:00")}. One trade a day.`) },
    ],
    candles: m15.slice(-CHART_BARS),
    lastCandleAt: m15.at(-1)?.time ?? null,
    historyFrom: rec.historyFrom,
  };
}
