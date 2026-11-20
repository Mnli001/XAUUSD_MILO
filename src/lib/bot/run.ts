import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { loadCandles, SYMBOL } from "../ingest/prices";
import { runBacktest, type BacktestResult } from "./backtest";
import { type BotParams, DEFAULT_PARAMS } from "./strategy";

/** Every stored candle plus the stored HIGH-impact event times. */
export async function loadBacktestData() {
  const [m15, h1, h4, d1, events] = await Promise.all([
    loadCandles(SYMBOL, "15min", 150_000),
    loadCandles(SYMBOL, "1h", 40_000),
    loadCandles(SYMBOL, "4h", 10_000),
    loadCandles(SYMBOL, "1day", 3_000),
    db.select({ time: schema.economicEvents.time }).from(schema.economicEvents).where(eq(schema.economicEvents.impact, "HIGH")),
  ]);
  return { m15, h1, h4, d1, news: events.map((e) => e.time) };
}

/** Runs the strategy over every stored candle. News = stored HIGH-impact events. */
export async function runBacktestFromDb(params: BotParams = DEFAULT_PARAMS, startBalance = 10_000): Promise<BacktestResult> {
  return runBacktest({ ...(await loadBacktestData()), params, startBalance });
}

const num = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Reads strategy parameters from query-string values, clamped to sane ranges. */
export function paramsFromQuery(q: Record<string, string | undefined>): { params: BotParams; startBalance: number } {
  const d = DEFAULT_PARAMS;
  return {
    startBalance: num(q.startBalance, 10_000, 100, 10_000_000),
    params: {
      minBias: num(q.minBias, d.minBias, 0, 100),
      sessionStartUb: Math.floor(num(q.sessionStartUb, d.sessionStartUb, 0, 23)),
      sessionEndUb: Math.floor(num(q.sessionEndUb, d.sessionEndUb, 0, 23)),
      atrMult: num(q.atrMult, d.atrMult, 0.2, 10),
      rr: num(q.rr, d.rr, 0.5, 10),
      riskPct: num(q.riskPct, d.riskPct, 0.05, 5),
      maxTradesPerDay: Math.floor(num(q.maxTradesPerDay, d.maxTradesPerDay, 1, 50)),
      dailyLossPct: num(q.dailyLossPct, d.dailyLossPct, 0.1, 100),
      maxDrawdownPct: num(q.maxDrawdownPct, d.maxDrawdownPct, 1, 100),
      newsBeforeMin: num(q.newsBeforeMin, d.newsBeforeMin, 0, 600),
      newsAfterMin: num(q.newsAfterMin, d.newsAfterMin, 0, 600),
      spread: num(q.spread, d.spread, 0, 10),
      breakeven: q.breakeven === undefined ? d.breakeven : q.breakeven !== "0",
      requireH1Agree: q.requireH1Agree === undefined ? d.requireH1Agree : q.requireH1Agree === "1",
    },
  };
}
