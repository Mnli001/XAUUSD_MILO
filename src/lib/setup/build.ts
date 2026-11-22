import type { Candle } from "../analysis/indicators";
import { IDEAS, ideaContext, ideaTrades } from "../bot/ideas";
import { loadBacktestData } from "../bot/run";
import { type SetupHistory, type SetupNow, asianSetup, dipSetup, historyOf } from "./setups";

export type Setup = SetupNow & {
  id: "asian-breakout" | "trend-dip";
  name: string;
  rule: string; // the whole rule in a sentence or two
  history: SetupHistory; // every stored year
  recent: SetupHistory; // the last 12 months
};
export type SetupsView = { setups: Setup[]; candles: Candle[]; lastCandleAt: Date | null; historyFrom: Date | null };

const CHART_BARS = 128; // 32 hours of 15-minute candles
const YEAR = 365 * 864e5;
const CACHE_MS = 5 * 60 * 1000;

type Prepared = { at: number; data: Awaited<ReturnType<typeof loadBacktestData>>; prepared: ReturnType<typeof ideaContext>; records: { all: SetupHistory; recent: SetupHistory }[] };
let cache: Prepared | null = null;
export const clearSetupCache = () => { cache = null; };

/** Loading and replaying three years of candles is the slow part, so it is kept for a few minutes. */
async function prepare(now: Date): Promise<Prepared> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const data = await loadBacktestData();
  const prepared = ideaContext(data);
  const since = now.getTime() - YEAR;
  const records = [IDEAS[1], IDEAS[2]].map((idea) => {
    const trades = data.m15.length ? ideaTrades(prepared, idea) : [];
    return { all: historyOf(trades), recent: historyOf(trades.filter((t) => t.openedAt.getTime() >= since)) };
  });
  cache = { at: Date.now(), data, prepared, records };
  return cache;
}

/** Both setups read against the latest stored candles, each with its rule's replayed record. */
export async function getSetups(now: Date): Promise<SetupsView> {
  const { data, prepared, records } = await prepare(now);
  const { m15, news } = data;
  const { ctx, ready } = prepared;
  const last = m15.length - 1;
  const asian = asianSetup(m15.slice(-200), last >= 0 ? ctx.daily[last] : null, news, now);
  const dip = dipSetup(m15.slice(-200), { rsi: last >= 0 ? ctx.rsi15[last] : NaN, atr: last >= 0 ? ctx.atr15[last] : NaN, daily: last >= 0 ? ctx.daily[last] : null, h4: last >= 0 ? ctx.h4[last] : null }, news, now);
  return {
    setups: [
      { ...asian, id: "asian-breakout", name: "Азийн хүрээний breakout", history: records[0].all, recent: records[0].recent,
        rule: "08:00–15:00 (УБ) цагийн хамгийн өндөр, нам үнэ хүрээг тогтооно. 15:00–00:00 цагт хүрээнээс гарсан эхний 15 минутын хаалтыг, өдрийн трендийн чиглэлд л дагана. Stop хүрээний дунд, target stop-оос 2 дахин хол, 04:00 гэхэд хаана. Өдөрт нэг арилжаа." },
      { ...dip, id: "trend-dip", name: "Тренд доторх уналтыг авах", history: records[1].all, recent: records[1].recent,
        rule: "Өдөр, 4 цагийн тренд нэг чиглэлд байхад 15 минутын RSI 30-аас доош орвол BUY (тренд доош бол RSI 70-аас дээш гарахад SELL). Stop 2 ATR, target 1.5 ATR, 8 цагийн дотор хаана." },
    ],
    candles: m15.slice(-CHART_BARS),
    lastCandleAt: m15.at(-1)?.time ?? null,
    historyFrom: ready >= 0 ? m15[ready].time : null,
  };
}
