import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { type Candle, type Timeframe, atr } from "./analysis/indicators";
import { combineBias, timeframeScore } from "./analysis/bias";
import { loadCandles, upsertCandles, gapSize } from "./ingest/prices";
import { type PriceProvider, ProviderError } from "./data/priceProvider";
import { checkPriceAlerts } from "./priceAlerts";
import { GOLD, MARKETS } from "./marketList";

export { MARKETS } from "./marketList";

const H4 = 4 * 36e5;
/** An empty market's first hourly load: about four months of round-the-clock bars, enough for the 4-hour reading. */
const FIRST_HOURS = 2000;
/** And its first daily load: well past the 210 bars a daily reading needs. */
const FIRST_DAYS = 400;
/** A daily series whose newest bar is older than this is refreshed. */
const DAILY_STALE_MS = 20 * 36e5;

/** 4-hour bars from hourly ones, on the UTC clock (00, 04, 08 …). */
export function aggregate4h(hours: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (const c of hours) {
    const start = Math.floor(c.time.getTime() / H4) * H4;
    const last = out.at(-1);
    if (last && last.time.getTime() === start) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
    } else out.push({ time: new Date(start), open: c.open, high: c.high, low: c.low, close: c.close });
  }
  return out;
}

export type MarketView = {
  price: number;
  changePct: number | null; // against yesterday's close
  scores: Record<"1h" | "4h" | "1day", number | null>;
  bias: ReturnType<typeof combineBias>;
  prevHigh: number | null; prevLow: number | null;
  atr: number | null; // daily
  updatedAt: Date;
};

/** What one instrument looks like now: its price, the day's change, the direction on three timeframes and yesterday's range. */
export function marketView(hours: Candle[], days: Candle[], now: Date): MarketView | null {
  const last = hours.at(-1);
  if (!last) return null;
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const closed = days.filter((d) => d.time.getTime() < dayStart);
  const prev = closed.at(-1) ?? null;
  const scores = { "1h": timeframeScore(hours), "4h": timeframeScore(aggregate4h(hours)), "1day": timeframeScore(days) };
  const a = atr(closed);
  return {
    price: last.close,
    changePct: prev ? ((last.close - prev.close) / prev.close) * 100 : null,
    scores,
    bias: combineBias(scores as Partial<Record<Timeframe, number | null>>),
    prevHigh: prev?.high ?? null,
    prevLow: prev?.low ?? null,
    atr: Number.isFinite(a) ? a : null,
    updatedAt: last.time,
  };
}

/** The reading and the last hourly bars (for the chart) of one instrument, from what is stored. */
export async function loadMarket(symbol: string, now: Date, chartBars = 0) {
  const [hours, days] = await Promise.all([loadCandles(symbol, "1h", 1200), loadCandles(symbol, "1day", 400)]);
  return { view: marketView(hours, days, now), chart: chartBars ? hours.slice(-chartBars) : [] };
}

/** Hourly bars for every instrument. A failure is reported per instrument and never stops the others or gold. */
export async function ingestMarkets(provider: PriceProvider, now: Date): Promise<{ stored: number; failed: string[] }> {
  let stored = 0;
  const failed: string[] = [];
  for (const m of MARKETS) {
    try {
      const [last] = await loadCandles(m.symbol, "1h", 1);
      const size = last ? await gapSize(m.symbol, "1h", now) : FIRST_HOURS;
      stored += await upsertCandles(m.symbol, "1h", await provider.fetchCandles(m.symbol, "1h", { outputsize: size }));
    } catch (e) {
      if (!(e instanceof ProviderError)) console.error(`[markets] ${m.symbol} failed`, e);
      failed.push(m.symbol);
    }
  }
  return { stored, failed };
}

/** The first instrument whose daily bars are missing or stale, or null. One per run keeps the provider's minute limit. */
export async function dailyDue(now: Date): Promise<string | null> {
  for (const m of MARKETS) {
    const [last] = await db.select({ time: schema.candles.time }).from(schema.candles)
      .where(and(eq(schema.candles.symbol, m.symbol), eq(schema.candles.timeframe, "1day"))).orderBy(desc(schema.candles.time)).limit(1);
    if (!last || now.getTime() - last.time.getTime() > DAILY_STALE_MS + 864e5) return m.symbol;
  }
  return null;
}

export async function ingestDaily(provider: PriceProvider, symbol: string, now: Date): Promise<number> {
  const [last] = await loadCandles(symbol, "1day", 1);
  return upsertCandles(symbol, "1day", await provider.fetchCandles(symbol, "1day", { outputsize: last ? await gapSize(symbol, "1day", now) : FIRST_DAYS }));
}

type AlertDeps = Parameters<typeof checkPriceAlerts>[1];
/** Price alerts on an instrument's newest bars: each bar's range, for the alerts set before it began. */
export async function checkMarketAlerts(symbol: string, bars: Candle[], at: Date, deps?: AlertDeps): Promise<number> {
  if (symbol === GOLD) return 0;
  let n = 0;
  for (const b of bars) n += await checkPriceAlerts({ symbol, high: b.high, low: b.low, price: b.close, at, from: b.time }, deps);
  return n;
}

/** The hourly run for the other instruments: new bars, one stale daily series, then their price alerts. */
export async function runMarkets(provider: PriceProvider, now: Date): Promise<string> {
  const r = await ingestMarkets(provider, now);
  const due = await dailyDue(now);
  if (due) await ingestDaily(provider, due, now).catch((e) => console.warn(`[markets] daily ${due} failed: ${e instanceof Error ? e.message : e}`));
  let fired = 0;
  for (const m of MARKETS) fired += await checkMarketAlerts(m.symbol, await loadCandles(m.symbol, "1h", 2), now).catch(() => 0);
  return JSON.stringify({ stored: r.stored, failed: r.failed, daily: due, alerts: fired });
}
