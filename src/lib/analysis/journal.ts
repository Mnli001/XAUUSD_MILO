import { ubHour, ubWeekday, sessionOfUbHour } from "../time";

export const CONTRACT_SIZE = 100; // oz per lot, XAUUSD

export type TradeInput = {
  direction: "BUY" | "SELL";
  lots: number;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  openedAt: Date;
  closedAt: Date | null;
};

type Bucket = { count: number; pnl: number };
export type Performance = {
  count: number;
  winRate: number | null;
  totalPnl: number;
  profitFactor: number | null;
  avgR: number | null;
  maxDrawdown: number;
  equity: { time: Date; value: number }[];
  byHour: Record<number, Bucket>; // UB hour of openedAt
  byWeekday: Record<number, Bucket>; // 1 = Monday … 7 = Sunday, UB
  bySession: Record<string, Bucket>;
};

/** Profit in USD; null while the trade is open. */
export function tradePnl(t: TradeInput): number | null {
  if (t.exitPrice === null || t.closedAt === null) return null;
  return (t.exitPrice - t.entryPrice) * (t.direction === "BUY" ? 1 : -1) * t.lots * CONTRACT_SIZE;
}

/** Profit as a multiple of the initial risk; null when open, without a stop, or with a stop at entry. */
export function tradeR(t: TradeInput): number | null {
  const pnl = tradePnl(t);
  if (pnl === null || t.stopLoss === null) return null;
  const risk = Math.abs(t.entryPrice - t.stopLoss) * t.lots * CONTRACT_SIZE;
  return risk > 0 ? pnl / risk : null;
}

function add<K extends string | number>(m: Record<K, Bucket>, k: K, pnl: number) {
  const b = (m[k] ??= { count: 0, pnl: 0 });
  b.count++;
  b.pnl += pnl;
}

/** One closed trade, reduced to what the statistics need: its result in dollars, when it opened and closed, its R. */
export type ClosedTrade = { pnl: number; openedAt: Date; closedAt: Date; r: number | null };

/** Statistics over closed trades only. */
export function performance(trades: TradeInput[]): Performance {
  return performanceOf(trades.flatMap((t) => { const pnl = tradePnl(t); return pnl === null ? [] : [{ pnl, openedAt: t.openedAt, closedAt: t.closedAt!, r: tradeR(t) }]; }));
}

/** The same statistics from trades whose dollar result is already known (the robot's closed deals). */
export function performanceOf(trades: ClosedTrade[]): Performance {
  const closed = [...trades].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());

  const out: Performance = { count: closed.length, winRate: null, totalPnl: 0, profitFactor: null, avgR: null, maxDrawdown: 0, equity: [], byHour: {}, byWeekday: {}, bySession: {} };
  let wins = 0, grossProfit = 0, grossLoss = 0, rSum = 0, rCount = 0, peak = 0;
  for (const t of closed) {
    const pnl = t.pnl;
    out.totalPnl += pnl;
    if (pnl > 0) { wins++; grossProfit += pnl; } else grossLoss -= pnl;
    if (t.r !== null) { rSum += t.r; rCount++; }
    out.equity.push({ time: t.closedAt, value: out.totalPnl });
    peak = Math.max(peak, out.totalPnl);
    out.maxDrawdown = Math.max(out.maxDrawdown, peak - out.totalPnl);
    const h = ubHour(t.openedAt);
    add(out.byHour, h, pnl);
    add(out.byWeekday, ubWeekday(t.openedAt), pnl);
    add(out.bySession, sessionOfUbHour(h), pnl);
  }
  if (closed.length > 0) out.winRate = (wins / closed.length) * 100;
  if (grossLoss > 0) out.profitFactor = grossProfit / grossLoss;
  if (rCount > 0) out.avgR = rSum / rCount;
  return out;
}
