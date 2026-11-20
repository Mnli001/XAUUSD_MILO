import { type Candle, type Timeframe, ema, atrSeries } from "../analysis/indicators";
import { CONTRACT_SIZE, performance, type Performance } from "../analysis/journal";
import { ubDateKey } from "../time";
import { type BotParams, type Side, DEFAULT_PARAMS, inSession, inNewsWindow, directionFromScores, pullbackSignal, scoreSeries } from "./strategy";

export type Signal = Side | null;
export type ExitReason = "TP" | "SL" | "BE" | "WEEKEND" | "END";
export type SimTrade = {
  direction: Side; lots: number; entryPrice: number; exitPrice: number; stopLoss: number; // initial stop
  openedAt: Date; closedAt: Date; pnl: number; r: number; reason: ExitReason;
};
export type SimResult = { trades: SimTrade[]; finalBalance: number; maxDrawdownPct: number; killSwitchAt: Date | null };

const M15 = 15 * 6e4;
/** Friday 20:00 UTC until the market reopens: flat, no new trades. */
function nearWeekend(t: Date): boolean {
  const d = t.getUTCDay();
  return d === 6 || d === 0 || (d === 5 && t.getUTCHours() >= 20);
}

/**
 * Replays signals over 15-minute bars. signals[i] is decided at the close of bar i and filled at the
 * open of bar i + 1. Inside a bar the stop is checked before the target (pessimistic). The kill-switch
 * time is recorded, but the replay continues so the whole period can be judged.
 */
export function simulateTrades(m15: Candle[], signals: Signal[], atr15: number[], p: BotParams, startBalance: number): SimResult {
  const trades: SimTrade[] = [];
  let balance = startBalance;
  let peak = startBalance;
  let maxDrawdownPct = 0;
  let killSwitchAt: Date | null = null;
  let day = "";
  let dayStartBalance = startBalance;
  let tradesToday = 0;
  let pos: { side: Side; lots: number; entry: number; stop: number; initialStop: number; target: number; dist: number; openedAt: Date } | null = null;

  const close = (exit: number, at: Date, reason: ExitReason) => {
    if (!pos) return;
    const dir = pos.side === "BUY" ? 1 : -1;
    const pnl = (exit - pos.entry) * dir * pos.lots * CONTRACT_SIZE;
    trades.push({ direction: pos.side, lots: pos.lots, entryPrice: pos.entry, exitPrice: exit, stopLoss: pos.initialStop, openedAt: pos.openedAt, closedAt: at, pnl, r: pnl / (pos.dist * pos.lots * CONTRACT_SIZE), reason });
    balance += pnl;
    peak = Math.max(peak, balance);
    const dd = ((peak - balance) / peak) * 100;
    maxDrawdownPct = Math.max(maxDrawdownPct, dd);
    if (killSwitchAt === null && dd >= p.maxDrawdownPct) killSwitchAt = at;
    pos = null;
  };

  for (let i = 1; i < m15.length; i++) {
    const bar = m15[i];
    const key = ubDateKey(bar.time);
    if (key !== day) { day = key; dayStartBalance = balance; tradesToday = 0; }
    const weekend = nearWeekend(bar.time);

    // entry at this bar's open, from the signal decided on the previous bar
    const sig = signals[i - 1];
    if (!pos && sig && !weekend && tradesToday < p.maxTradesPerDay && balance - dayStartBalance > -(p.dailyLossPct / 100) * dayStartBalance) {
      const dist = atr15[i - 1] * p.atrMult;
      const lots = Math.floor((((p.riskPct / 100) * balance) / (dist * CONTRACT_SIZE)) * 100) / 100;
      if (Number.isFinite(dist) && dist > 0 && lots >= 0.01) {
        const dir = sig === "BUY" ? 1 : -1;
        const entry = bar.open + dir * p.spread;
        pos = { side: sig, lots, entry, stop: entry - dir * dist, initialStop: entry - dir * dist, target: entry + dir * dist * p.rr, dist, openedAt: bar.time };
        tradesToday++;
      }
    }

    if (pos) {
      const endOfBar = new Date(bar.time.getTime() + M15);
      const long = pos.side === "BUY";
      if (weekend) close(bar.open, bar.time, "WEEKEND");
      else if (long ? bar.low <= pos.stop : bar.high >= pos.stop) close(pos.stop, endOfBar, pos.stop === pos.entry ? "BE" : "SL");
      else if (long ? bar.high >= pos.target : bar.low <= pos.target) close(pos.target, endOfBar, "TP");
      else if (p.breakeven && pos.stop !== pos.entry && (long ? bar.high >= pos.entry + pos.dist : bar.low <= pos.entry - pos.dist)) pos.stop = pos.entry;
    }
  }
  const last = m15.at(-1);
  if (pos && last) close(last.close, new Date(last.time.getTime() + M15), "END");
  return { trades, finalBalance: balance, maxDrawdownPct, killSwitchAt };
}

const STEP: Record<Timeframe, number> = { "15min": M15, "1h": 36e5, "4h": 4 * 36e5, "1day": 864e5 };

/** For each decision time, the score of the newest candle of `tf` that has fully closed by then. */
function alignClosed(decisionTimes: number[], candles: Candle[], scores: (number | null)[], tf: Timeframe): (number | null)[] {
  const out: (number | null)[] = [];
  let j = -1;
  for (const t of decisionTimes) {
    while (j + 1 < candles.length && candles[j + 1].time.getTime() + STEP[tf] <= t) j++;
    out.push(j >= 0 ? scores[j] : null);
  }
  return out;
}

export type BacktestInput = { m15: Candle[]; h1: Candle[]; h4: Candle[]; d1: Candle[]; news: Date[]; params?: BotParams; startBalance?: number };

/**
 * One entry signal per 15-minute bar, using only information available at that bar's close.
 * readyFrom is the first bar at which every timeframe has a score (-1 if never).
 */
export function buildSignals({ m15, h1, h4, d1, news, params = DEFAULT_PARAMS }: BacktestInput): { signals: Signal[]; readyFrom: number } {
  const decision = m15.map((c) => c.time.getTime() + M15);
  const s15 = scoreSeries(m15);
  const s1 = alignClosed(decision, h1, scoreSeries(h1), "1h");
  const s4 = alignClosed(decision, h4, scoreSeries(h4), "4h");
  const sd = alignClosed(decision, d1, scoreSeries(d1), "1day");
  const e20 = ema(m15.map((c) => c.close), 20);
  const readyFrom = m15.findIndex((_, i) => s15[i] !== null && s1[i] !== null && s4[i] !== null && sd[i] !== null);
  const signals = m15.map((bar, i): Signal => {
    const at = new Date(decision[i]);
    if (!inSession(at, params) || inNewsWindow(at, news, params)) return null;
    const side = directionFromScores({ "15min": s15[i], "1h": s1[i], "4h": s4[i], "1day": sd[i] }, params);
    return side && pullbackSignal(bar, e20[i], side) ? side : null;
  });
  return { signals, readyFrom };
}

export type Verdict = "INSUFFICIENT" | "LOSING" | "MARGINAL" | "PROMISING";
export const MIN_TRADES_FOR_VERDICT = 30;

/** A deliberately strict reading of a backtest. */
export function verdict(r: { stats: Performance; returnPct: number; maxDrawdownPct: number }): Verdict {
  if (r.stats.count < MIN_TRADES_FOR_VERDICT) return "INSUFFICIENT";
  const pf = r.stats.profitFactor;
  if (r.returnPct <= 0 || (pf !== null && pf < 1)) return "LOSING";
  if ((pf !== null && pf < 1.3) || r.maxDrawdownPct >= 10) return "MARGINAL";
  return "PROMISING";
}

export type MonthRow = { month: string; trades: number; pnl: number };
export type BacktestResult = SimResult & {
  from: Date | null; to: Date | null; startBalance: number; returnPct: number;
  stats: Performance; byReason: Record<ExitReason, number>; months: MonthRow[]; signalCount: number; verdict: Verdict;
};

export function runBacktest(input: BacktestInput): BacktestResult {
  const params = input.params ?? DEFAULT_PARAMS;
  const startBalance = input.startBalance ?? 10_000;
  const { signals, readyFrom } = buildSignals({ ...input, params });
  const sim = simulateTrades(input.m15, signals, atrSeries(input.m15), params, startBalance);
  const byReason: Record<ExitReason, number> = { TP: 0, SL: 0, BE: 0, WEEKEND: 0, END: 0 };
  const months = new Map<string, MonthRow>();
  for (const t of sim.trades) {
    byReason[t.reason]++;
    const month = ubDateKey(t.closedAt).slice(0, 7);
    const row = months.get(month) ?? { month, trades: 0, pnl: 0 };
    row.trades++;
    row.pnl += t.pnl;
    months.set(month, row);
  }
  const result: BacktestResult = {
    ...sim,
    from: readyFrom >= 0 ? input.m15[readyFrom].time : null,
    to: input.m15.at(-1)?.time ?? null,
    startBalance,
    returnPct: ((sim.finalBalance - startBalance) / startBalance) * 100,
    stats: performance(sim.trades),
    byReason,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    signalCount: signals.filter(Boolean).length,
    verdict: "INSUFFICIENT",
  };
  result.verdict = verdict(result);
  return result;
}
