import type { Candle } from "../analysis/indicators";
import { type SimTrade, alignClosed, simulateOrders } from "./backtest";
import { asianRangeOrders, IDEAS } from "./ideas";
import { scoreSeries } from "./strategy";
import { type SegmentStats, segmentStats, MIN_TEST_AVG_R, MIN_TEST_PROFIT_FACTOR } from "./variants";

const M15 = 15 * 6e4;
/** The one hypothesis being tested forward: Asian range breakout in the direction of the daily trend. Fixed when the test began. */
export const PAPER_IDEA = IDEAS[1];
export const PAPER_RR = 2;
/** Fixed before the forward test started. */
export const PAPER_MIN_TRADES = 40;

export type PaperVerdict = "PENDING" | "PASSED" | "FAILED";
export function paperVerdict(s: SegmentStats): PaperVerdict {
  if (s.n < PAPER_MIN_TRADES) return "PENDING";
  const ok = s.avgR !== null && s.avgR >= MIN_TEST_AVG_R && (s.profitFactor === null || s.profitFactor >= MIN_TEST_PROFIT_FACTOR);
  return ok ? "PASSED" : "FAILED";
}

export type TodayStatus = {
  phase: "NO_DATA" | "RANGE" | "WATCHING" | "DONE" | "CLOSED";
  rangeHigh: number | null;
  rangeLow: number | null;
  trend: "UP" | "DOWN" | null;
};
export type PaperReport = {
  startedAt: Date; startBalance: number; balance: number;
  closed: SimTrade[]; open: SimTrade | null;
  stats: SegmentStats; verdict: PaperVerdict; today: TodayStatus; lastBarAt: Date | null;
};

/**
 * Paper trading is a replay: the same order builder and simulator as the backtest, run over the
 * bars that have fully closed, trading only signals decided at or after startedAt. Calling it again
 * later with more bars extends the same history, so nothing needs to be stored except the start time.
 */
export function paperReport(data: { m15: Candle[]; d1: Candle[]; news: Date[] }, startedAt: Date, now: Date, startBalance = 10_000): PaperReport {
  const bars = data.m15.filter((c) => c.time.getTime() + M15 <= now.getTime());
  const decisions = bars.map((c) => c.time.getTime() + M15);
  const daily = alignClosed(decisions, data.d1, scoreSeries(data.d1), "1day");
  const all = asianRangeOrders(bars, { rr: PAPER_RR, news: data.news, params: PAPER_IDEA.params, trend: daily });
  const orders = all.map((o, i) => (decisions[i] >= startedAt.getTime() ? o : null));
  const sim = simulateOrders(bars, orders, PAPER_IDEA.params, startBalance);

  const last = sim.trades.at(-1);
  const open = last && last.reason === "END" ? last : null;
  const closed = open ? sim.trades.slice(0, -1) : sim.trades;

  // today's picture, in UTC days like the strategy itself
  const dayKey = now.toISOString().slice(0, 10);
  const todays = bars.map((b, i) => ({ b, i })).filter(({ b }) => b.time.toISOString().slice(0, 10) === dayKey);
  const asia = todays.filter(({ b }) => b.time.getUTCHours() < 7);
  const tradedToday = todays.some(({ i }) => all[i] !== null);
  const hour = now.getUTCHours();
  const weekend = now.getUTCDay() === 6 || now.getUTCDay() === 0;
  const lastScore = daily.at(-1);
  const today: TodayStatus = {
    phase: bars.length === 0 ? "NO_DATA" : weekend ? "CLOSED" : hour < 7 ? "RANGE" : tradedToday ? "DONE" : hour < 16 ? "WATCHING" : "CLOSED",
    rangeHigh: asia.length ? Math.max(...asia.map(({ b }) => b.high)) : null,
    rangeLow: asia.length ? Math.min(...asia.map(({ b }) => b.low)) : null,
    trend: lastScore === null || lastScore === undefined || lastScore === 0 ? null : lastScore > 0 ? "UP" : "DOWN",
  };

  const stats = segmentStats(closed);
  return {
    startedAt, startBalance,
    balance: sim.finalBalance - (open?.pnl ?? 0),
    closed, open, stats, verdict: paperVerdict(stats), today,
    lastBarAt: bars.at(-1)?.time ?? null,
  };
}
