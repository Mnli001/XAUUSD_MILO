import { loadLiveCandles } from "../feed";
import { getReasoning } from "../reasoningLive";
import { findSmcSetups, type SmcOptions, type SmcSetup } from "../analysis/smc";

/**
 * The day-trade tool's brain, on the site so it can be tested and explained: on every closed
 * 15-minute candle it looks for sweep → shift → return to a fair value gap → reaction, then asks
 * the other methods. The robot only places the order.
 *
 * The settings are the ones the candle research held up with (scripts/smc-research.ts,
 * docs/smc-research-2026-11-24.txt): entries on the reaction, swings three candles wide, a 2R
 * target, and only when the many-method reading leans the same way. On its own the pattern showed
 * no edge; against the reading it lost.
 */
export const DAY_OPTIONS: Partial<SmcOptions> = { reaction: true, rr: 2, swing: 3 };
export const DAY_RR = 2;
/** How many more methods must read the trade's side than the other side, unless the owner sets it. */
export const DAY_MIN_LEAN = 2;
/** A signal is acted on only while it is this fresh; after that the price has moved on. */
export const DAY_SIGNAL_TTL_MS = 8 * 60_000;
const M15 = 15 * 60_000;

export type DaySetupView = {
  id: number; // unix seconds of the close of the candle that triggered it
  side: "BUY" | "SELL";
  risk: number; // dollars from entry to stop
  entry: number; stop: number; target: number;
  zone: SmcSetup["zone"];
  level: number; // the liquidity that was swept
  sweepAt: Date; shiftAt: Date; at: Date;
  buy: number; sell: number; total: number; // the reading when it triggered (0s when unknown)
  lean: number; // methods for the trade's side minus methods against
};
export type DayState = { fresh: DaySetupView | null; recent: DaySetupView[]; asOf: number };

let memo: { bar: number; setups: SmcSetup[]; times: number[]; readings: Map<number, { buy: number; sell: number; total: number }> } | null = null;
export const clearDayMemo = () => { memo = null; };

/** The newest setups on closed candles, and the one (if any) that triggered on the candle that just closed. */
export async function getDayState(now: Date): Promise<DayState> {
  const all = await loadLiveCandles("15min", 420, now);
  const closed = all.filter((c) => c.time.getTime() + M15 <= now.getTime());
  const last = closed.at(-1);
  if (!last || closed.length < 60) return { fresh: null, recent: [], asOf: 0 };
  const bar = last.time.getTime();
  if (!memo || memo.bar !== bar) memo = { bar, setups: findSmcSetups(closed, DAY_OPTIONS), times: closed.map((c) => c.time.getTime()), readings: memo?.readings ?? new Map() };
  const { setups, times } = memo;
  const view = (s: SmcSetup, r: { buy: number; sell: number; total: number }): DaySetupView => ({
    id: Math.round((times[s.at] + M15) / 1000), side: s.side, risk: s.risk, entry: s.entry, stop: s.stop, target: s.target, zone: s.zone, level: s.level,
    sweepAt: new Date(times[s.sweepAt]), shiftAt: new Date(times[s.shiftAt]), at: new Date(times[s.at] + M15),
    ...r, lean: s.side === "BUY" ? r.buy - r.sell : r.sell - r.buy,
  });
  // The reading is only knowable at the moment a setup triggers, so it is kept from then on.
  const freshSetup = setups.find((s) => s.at === closed.length - 1) ?? null;
  if (freshSetup) {
    const id = Math.round((times[freshSetup.at] + M15) / 1000);
    if (!memo.readings.has(id)) {
      const r = (await getReasoning(now, "en").catch(() => null))?.reasoning;
      memo.readings.set(id, r ? { buy: r.buy, sell: r.sell, total: r.buy + r.sell + r.neutral } : { buy: 0, sell: 0, total: 0 });
    }
  }
  const none = { buy: 0, sell: 0, total: 0 };
  const recent = setups.slice(-6).reverse().map((s) => view(s, memo!.readings.get(Math.round((times[s.at] + M15) / 1000)) ?? none));
  const fresh = freshSetup && now.getTime() - (bar + M15) <= DAY_SIGNAL_TTL_MS ? recent.find((v) => v.id === Math.round((bar + M15) / 1000)) ?? null : null;
  return { fresh, recent, asOf: bar + M15 };
}

/** What the robot is told: nothing, or a side with the stop distance in dollars (prices differ between brokers; distances do not). */
export type DayOrder = { id: number; dir: 1 | -1; risk: number; rr: number; ageSec: number };
export function dayOrderFrom(state: DayState, minLean: number, now: Date): DayOrder | null {
  const f = state.fresh;
  if (!f || f.total === 0 || f.lean < minLean) return null;
  return { id: f.id, dir: f.side === "BUY" ? 1 : -1, risk: Math.round(f.risk * 100) / 100, rr: DAY_RR, ageSec: Math.max(0, Math.round((now.getTime() - f.id * 1000) / 1000)) };
}
