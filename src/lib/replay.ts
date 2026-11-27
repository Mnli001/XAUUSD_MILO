/**
 * Bar replay: practice on a past day, bar by bar, with no money. A practice trade opens at the close of the bar on
 * screen with a stop and target set in dollars from the entry, and is settled on each next bar. When one bar reaches
 * both, the stop is taken: a 15-minute bar does not say which came first, and the cautious reading teaches better.
 * Money is counted on 0.01 lot, where $1 of price is $1.
 */

export type Bar = { time: number; open: number; high: number; low: number; close: number };
export type Side = "BUY" | "SELL";
export type PracticeTrade = { id: number; side: Side; entry: number; stop: number; target: number; openedAt: number };
export type ClosedTrade = PracticeTrade & { exit: number; closedAt: number; result: "WIN" | "LOSS" | "MANUAL"; r: number; pnl: number };

const round = (x: number) => Math.round(x * 100) / 100;

export function openTrade(side: Side, bar: Bar, stopUsd: number, targetUsd: number, id: number): PracticeTrade {
  const entry = bar.close;
  return side === "BUY"
    ? { id, side, entry, stop: round(entry - stopUsd), target: round(entry + targetUsd), openedAt: bar.time }
    : { id, side, entry, stop: round(entry + stopUsd), target: round(entry - targetUsd), openedAt: bar.time };
}

export function closeTrade(t: PracticeTrade, exit: number, at: number, result: ClosedTrade["result"]): ClosedTrade {
  const pnl = round((t.side === "BUY" ? exit - t.entry : t.entry - exit));
  const risk = Math.abs(t.entry - t.stop);
  return { ...t, exit, closedAt: at, result, pnl, r: risk > 0 ? round(pnl / risk) : 0 };
}

/** Settles the open trades on a new bar. */
export function stepTrades(open: PracticeTrade[], bar: Bar): { open: PracticeTrade[]; closed: ClosedTrade[] } {
  const still: PracticeTrade[] = [], closed: ClosedTrade[] = [];
  for (const t of open) {
    const buy = t.side === "BUY";
    const stopHit = buy ? bar.low <= t.stop : bar.high >= t.stop;
    const targetHit = buy ? bar.high >= t.target : bar.low <= t.target;
    if (stopHit) closed.push(closeTrade(t, t.stop, bar.time, "LOSS"));
    else if (targetHit) closed.push(closeTrade(t, t.target, bar.time, "WIN"));
    else still.push(t);
  }
  return { open: still, closed };
}

export function summary(closed: Pick<ClosedTrade, "r" | "pnl" | "result">[]) {
  const wins = closed.filter((c) => c.pnl > 0).length;
  return {
    trades: closed.length,
    wins,
    totalR: round(closed.reduce((s, c) => s + c.r, 0)),
    pnl: round(closed.reduce((s, c) => s + c.pnl, 0)),
    winPct: closed.length ? Math.round((wins / closed.length) * 100) : null,
  };
}
