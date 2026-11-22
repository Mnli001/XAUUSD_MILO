import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { Candle } from "../analysis/indicators";
import { IDEAS, ideaContext, ideaTrades } from "../bot/ideas";
import { loadBacktestData } from "../bot/run";
import { loadCandles, SYMBOL } from "../ingest/prices";
import { type SetupHistory, type SetupNow, asianSetup, dipSetup, historyOf } from "./setups";

export type Setup = SetupNow & {
  id: "asian-breakout" | "trend-dip";
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
  const rows = [IDEAS[1], IDEAS[2]].map((idea) => {
    const trades = data.m15.length ? ideaTrades(prepared, idea) : [];
    return { all: historyOf(trades), recent: historyOf(trades.filter((t) => t.openedAt.getTime() >= since)) };
  });
  records = { at: Date.now(), historyFrom: prepared.ready >= 0 ? data.m15[prepared.ready].time : null, rows };
  return records;
}

/** Both setups read against the latest stored candles (closed bars only), each with its rule's replayed record. */
export async function getSetups(now: Date): Promise<SetupsView> {
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
  const last = closed.length - 1;
  const at = <T,>(series: T[], fallback: T) => (last >= 0 ? series[last] : fallback);
  const asian = asianSetup(closed.slice(-200), at(ctx.daily, null), news, now);
  const dip = dipSetup(closed.slice(-200), { rsi: at(ctx.rsi15, NaN), atr: at(ctx.atr15, NaN), daily: at(ctx.daily, null), h4: at(ctx.h4, null) }, news, now);
  return {
    setups: [
      { ...asian, id: "asian-breakout", name: "Азийн хүрээний breakout", history: rec.rows[0].all, recent: rec.rows[0].recent,
        rule: "08:00–15:00 (УБ) цагийн хамгийн өндөр, нам үнэ хүрээг тогтооно. 15:00–00:00 цагт хүрээнээс гарсан эхний 15 минутын хаалтыг, өдрийн трендийн чиглэлд л дагана. Stop хүрээний дунд, target stop-оос 2 дахин хол, 04:00 гэхэд хаана. Өдөрт нэг арилжаа." },
      { ...dip, id: "trend-dip", name: "Тренд доторх уналтыг авах", history: rec.rows[1].all, recent: rec.rows[1].recent,
        rule: "Өдөр, 4 цагийн тренд нэг чиглэлд байхад 15 минутын RSI 30-аас доош орвол BUY (тренд доош бол RSI 70-аас дээш гарахад SELL). Stop 2 ATR, target 1.5 ATR, 8 цагийн дотор хаана." },
    ],
    candles: m15.slice(-CHART_BARS),
    lastCandleAt: m15.at(-1)?.time ?? null,
    historyFrom: rec.historyFrom,
  };
}
