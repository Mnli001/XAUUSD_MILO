/**
 * The demo account's rules, on XAUUSD at a broker's usual terms: 100 ounces a lot, 0.01-lot steps, buying at the ask
 * and selling at the bid, margin at the opening price over the leverage, a margin call at 100% and a stop-out at 50%.
 * Pure: the database side (lib/demo/demo.ts) applies them.
 */
export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP";
export type Price = { bid: number; ask: number };

export const CONTRACT = 100;
export const LOT_MIN = 0.01;
export const LOT_MAX = 50;
export const LEVERAGES = [30, 100, 500] as const;
export const MARGIN_CALL = 100;
export const STOP_OUT = 50;
export const BALANCE_MIN = 10;
export const BALANCE_MAX = 10_000_000;

const r2 = (n: number) => Math.round(n * 100) / 100;
const sign = (s: Side) => (s === "BUY" ? 1 : -1);

export const openPriceFor = (side: Side, p: Price) => (side === "BUY" ? p.ask : p.bid);
export const closePriceFor = (side: Side, p: Price) => (side === "BUY" ? p.bid : p.ask);

/** Profit in dollars of `lots` from `open` to `close`. */
export const pnl = (side: Side, lots: number, open: number, close: number) => r2((close - open) * sign(side) * lots * CONTRACT);
export const marginFor = (lots: number, price: number, leverage: number) => r2((lots * CONTRACT * price) / leverage);
export const roundLots = (lots: number) => Math.floor(lots * 100 + 1e-9) / 100;

/** The lot size that loses `riskPct` of `balance` if the stop is hit (0 when there is no distance). */
export function riskLots(balance: number, riskPct: number, entry: number, sl: number): number {
  const dist = Math.abs(entry - sl);
  if (!(dist > 0) || !(balance > 0) || !(riskPct > 0)) return 0;
  return Math.min(LOT_MAX, roundLots((balance * riskPct) / 100 / (dist * CONTRACT)));
}

export function pendingTriggered(o: { side: Side; type: OrderType; price: number }, p: Price): boolean {
  if (o.side === "BUY") return o.type === "LIMIT" ? p.ask <= o.price : o.type === "STOP" ? p.ask >= o.price : false;
  return o.type === "LIMIT" ? p.bid >= o.price : o.type === "STOP" ? p.bid <= o.price : false;
}

/** Whether a position's stop or target is reached, judged at the price it would close at. */
export function exitHit(pos: { side: Side; sl: number | null; tp: number | null }, p: Price): "SL" | "TP" | null {
  const c = closePriceFor(pos.side, p);
  if (pos.side === "BUY") {
    if (pos.sl !== null && c <= pos.sl) return "SL";
    if (pos.tp !== null && c >= pos.tp) return "TP";
  } else {
    if (pos.sl !== null && c >= pos.sl) return "SL";
    if (pos.tp !== null && c <= pos.tp) return "TP";
  }
  return null;
}

export type Held = { side: Side; lots: number; openPrice: number };
export type AccountState = { balance: number; floating: number; equity: number; margin: number; free: number; level: number | null };

export function accountState(balance: number, leverage: number, positions: Held[], p: Price | null): AccountState {
  const floating = p ? r2(positions.reduce((s, x) => s + pnl(x.side, x.lots, x.openPrice, closePriceFor(x.side, p)), 0)) : 0;
  const margin = r2(positions.reduce((s, x) => s + marginFor(x.lots, x.openPrice, leverage), 0));
  const equity = r2(balance + floating);
  return { balance: r2(balance), floating, equity, margin, free: r2(equity - margin), level: margin > 0 ? r2((equity / margin) * 100) : null };
}

/** Positions a stop-out closes, worst first, until the margin level is back at 50% or nothing is left. */
export function stopOutVictims<T extends Held & { id: string }>(balance: number, leverage: number, positions: T[], p: Price): string[] {
  let open = [...positions];
  let bal = balance;
  const out: string[] = [];
  for (;;) {
    const s = accountState(bal, leverage, open, p);
    if (s.level === null || s.level >= STOP_OUT) return out;
    const worst = open.reduce((a, b) => (pnl(b.side, b.lots, b.openPrice, closePriceFor(b.side, p)) < pnl(a.side, a.lots, a.openPrice, closePriceFor(a.side, p)) ? b : a));
    bal += pnl(worst.side, worst.lots, worst.openPrice, closePriceFor(worst.side, p));
    out.push(worst.id);
    open = open.filter((x) => x !== worst);
  }
}

export type OrderInput = { side: Side; type: OrderType; lots: number; price?: number | null; sl?: number | null; tp?: number | null };
export type OrderError = "closed" | "lots" | "price" | "sl" | "tp" | "margin";

export const validLots = (lots: number) => Number.isFinite(lots) && lots >= LOT_MIN && lots <= LOT_MAX && Math.abs(lots * 100 - Math.round(lots * 100)) < 1e-6;

/** Stop and target on the right side of `ref` (the price the position closes at now, or the pending order's price). */
export function checkExits(side: Side, ref: number, sl: number | null | undefined, tp: number | null | undefined): "sl" | "tp" | null {
  if (sl != null && (!(sl > 0) || (side === "BUY" ? sl >= ref : sl <= ref))) return "sl";
  if (tp != null && (!(tp > 0) || (side === "BUY" ? tp <= ref : tp >= ref))) return "tp";
  return null;
}

export function validateOrder(o: OrderInput, p: Price | null, acct: { balance: number; leverage: number; positions: Held[] }): OrderError | null {
  if (!p) return "closed";
  if (!validLots(o.lots)) return "lots";
  let entry: number;
  if (o.type === "MARKET") {
    entry = openPriceFor(o.side, p);
    const bad = checkExits(o.side, closePriceFor(o.side, p), o.sl, o.tp);
    if (bad) return bad;
  } else {
    const at = o.price ?? NaN;
    if (!(at > 0)) return "price";
    const ok = o.side === "BUY" ? (o.type === "LIMIT" ? at < p.ask : at > p.ask) : (o.type === "LIMIT" ? at > p.bid : at < p.bid);
    if (!ok) return "price";
    entry = at;
    const bad = checkExits(o.side, at, o.sl, o.tp);
    if (bad) return bad;
  }
  const s = accountState(acct.balance, acct.leverage, acct.positions, p);
  if (marginFor(o.lots, entry, acct.leverage) > s.free) return "margin";
  return null;
}
