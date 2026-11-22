import { type Candle, rsi, atrSeries } from "../analysis/indicators";
import { type BacktestInput, type Order, alignClosed, simulateOrders } from "./backtest";
import { type BotParams, DEFAULT_PARAMS, inNewsWindow, scoreSeries } from "./strategy";
import { type VariantRow, segmentStats, TRAIN_FRACTION } from "./variants";

const M15 = 15 * 6e4;
const decisionTime = (bar: Candle) => new Date(bar.time.getTime() + M15);
type Score = number | null;

/**
 * Idea 1 — Asian range breakout. The range is the high/low of 00:00–07:00 UTC (08:00–15:00 UB).
 * Between 07:00 and 16:00 UTC the first 15-minute close outside the range is followed, with the
 * stop at the middle of the range, and the trade is flat by 20:00 UTC. One trade per day.
 */
export function asianRangeOrders(m15: Candle[], o: { rr: number; news: Date[]; params: BotParams; trend?: Score[] }): (Order | null)[] {
  const out: (Order | null)[] = new Array(m15.length).fill(null);
  let day = "";
  let high = -Infinity, low = Infinity, count = 0, done = false;
  m15.forEach((bar, i) => {
    const key = bar.time.toISOString().slice(0, 10);
    if (key !== day) { day = key; high = -Infinity; low = Infinity; count = 0; done = false; }
    const hour = bar.time.getUTCHours();
    if (hour < 7) { high = Math.max(high, bar.high); low = Math.min(low, bar.low); count++; return; }
    if (done || count < 20 || hour >= 16) return;
    const side = bar.close > high ? "BUY" : bar.close < low ? "SELL" : null;
    if (!side) return;
    const at = decisionTime(bar);
    if (inNewsWindow(at, o.news, o.params)) return;
    if (o.trend) {
      const t = o.trend[i];
      if (t === null || t === undefined || (side === "BUY" ? t <= 0 : t >= 0)) return;
    }
    const stopDist = Math.abs(bar.close - (high + low) / 2);
    const closeAt = Date.UTC(bar.time.getUTCFullYear(), bar.time.getUTCMonth(), bar.time.getUTCDate(), 20);
    const maxBars = Math.floor((closeAt - at.getTime()) / M15);
    if (stopDist <= 0 || maxBars < 1) return;
    out[i] = { side, stopDist, targetDist: stopDist * o.rr, maxBars };
    done = true;
  });
  return out;
}

/**
 * Idea 2 — buy dips in an uptrend, sell rallies in a downtrend. Daily and 4h scores give the trend;
 * a 15-minute RSI below rsiLow (above 100 − rsiLow for shorts) is the entry. Wide stop (2 ATR),
 * near target (1.5 ATR), out after 8 hours.
 */
export function dipOrders(m15: Candle[], o: { rsi15: number[]; atr15: number[]; daily: Score[]; h4: Score[]; news: Date[]; params: BotParams; rsiLow: number }): (Order | null)[] {
  return m15.map((bar, i) => {
    const d = o.daily[i], h = o.h4[i], r = o.rsi15[i], a = o.atr15[i];
    if (d === null || d === undefined || h === null || h === undefined || !Number.isFinite(r) || !Number.isFinite(a) || a <= 0) return null;
    const side = d > 0 && h > 0 && r < o.rsiLow ? "BUY" : d < 0 && h < 0 && r > 100 - o.rsiLow ? "SELL" : null;
    if (!side || inNewsWindow(decisionTime(bar), o.news, o.params)) return null;
    return { side, stopDist: 2 * a, targetDist: 1.5 * a, maxBars: 32 };
  });
}

/**
 * Idea 3 — the 15-minute bar that starts at a high-impact release. If it moved at least one ATR,
 * follow it (stop behind the bar) or, with fade, trade against it (stop one bar-range away). Out after 2 hours.
 */
export function newsOrders(m15: Candle[], o: { atr15: number[]; news: Date[]; rr: number; fade?: boolean }): (Order | null)[] {
  const releases = new Set(o.news.map((n) => n.getTime()));
  return m15.map((bar, i) => {
    if (i === 0 || !releases.has(bar.time.getTime())) return null;
    const a = o.atr15[i - 1];
    const move = bar.close - bar.open;
    if (!Number.isFinite(a) || a <= 0 || Math.abs(move) < a) return null;
    const up = move > 0;
    if (o.fade) {
      const stopDist = bar.high - bar.low;
      return { side: up ? "SELL" : "BUY", stopDist, targetDist: stopDist * o.rr, maxBars: 8 };
    }
    const stopDist = up ? bar.close - bar.low : bar.high - bar.close;
    return stopDist > 0 ? { side: up ? "BUY" : "SELL", stopDist, targetDist: stopDist * o.rr, maxBars: 8 } : null;
  });
}

type Context = { m15: Candle[]; rsi15: number[]; atr15: number[]; daily: Score[]; h4: Score[]; news: Date[] };
export type Idea = { name: string; params: BotParams; build: (c: Context) => (Order | null)[] };

const base: BotParams = { ...DEFAULT_PARAMS, breakeven: false };
const oneADay: BotParams = { ...base, maxTradesPerDay: 1 };

/** Fixed before looking at any result: three different kinds of entry, two settings each. */
export const IDEAS: Idea[] = [
  { name: "Азийн хүрээний breakout", params: oneADay, build: (c) => asianRangeOrders(c.m15, { rr: 2, news: c.news, params: oneADay }) }, // i18n-ok: server log, machine reply or research-script name
  { name: "Азийн хүрээний breakout + өдрийн тренд", params: oneADay, build: (c) => asianRangeOrders(c.m15, { rr: 2, news: c.news, params: oneADay, trend: c.daily }) }, // i18n-ok: server log, machine reply or research-script name
  { name: "Трендийн доторх уналтыг авах (RSI 30)", params: base, build: (c) => dipOrders(c.m15, { ...c, params: base, rsiLow: 30 }) }, // i18n-ok: server log, machine reply or research-script name
  { name: "Трендийн доторх уналтыг авах (RSI 25)", params: base, build: (c) => dipOrders(c.m15, { ...c, params: base, rsiLow: 25 }) }, // i18n-ok: server log, machine reply or research-script name
  { name: "Мэдээний дараах хөдөлгөөнийг дагах", params: base, build: (c) => newsOrders(c.m15, { atr15: c.atr15, news: c.news, rr: 2 }) }, // i18n-ok: server log, machine reply or research-script name
  { name: "Мэдээний дараах хөдөлгөөний эсрэг", params: base, build: (c) => newsOrders(c.m15, { atr15: c.atr15, news: c.news, rr: 1, fade: true }) }, // i18n-ok: server log, machine reply or research-script name
];

type IdeaInput = Omit<BacktestInput, "params" | "h1"> & { h1?: Candle[] };

/** Everything an idea reads, aligned to 15-minute decision times, and the first bar where the trend scores exist. */
export function ideaContext(input: IdeaInput): { ctx: Context; ready: number } {
  const { m15, h4, d1, news } = input;
  const decisions = m15.map((c) => c.time.getTime() + M15);
  const ctx: Context = {
    m15, news,
    rsi15: rsi(m15.map((c) => c.close)),
    atr15: atrSeries(m15),
    daily: alignClosed(decisions, d1, scoreSeries(d1), "1day"),
    h4: alignClosed(decisions, h4, scoreSeries(h4), "4h"),
  };
  return { ctx, ready: m15.findIndex((_, i) => ctx.daily[i] !== null && ctx.h4[i] !== null) };
}

/** One idea replayed over the whole history, from the first bar where it could be judged. */
export function ideaTrades({ ctx, ready }: { ctx: Context; ready: number }, { params, build }: Idea, startBalance = 10_000) {
  const orders = build(ctx).map((o, i) => (ready >= 0 && i >= ready ? o : null));
  return simulateOrders(ctx.m15, orders, params, startBalance).trades;
}

/** Runs every idea over the whole history and splits its trades at the same point in time. */
export function compareIdeas(input: IdeaInput, ideas: Idea[] = IDEAS): { rows: VariantRow[]; from: Date | null; splitAt: Date | null; to: Date | null } {
  const { m15 } = input;
  const prepared = ideaContext(input);
  // every idea is judged over the same window: from the first bar where the trend scores exist
  const { ready } = prepared;
  const from = ready >= 0 ? m15[ready].time : null;
  const to = m15.at(-1)?.time ?? null;
  const splitAt = from && to ? new Date(from.getTime() + (to.getTime() - from.getTime()) * TRAIN_FRACTION) : null;
  const rows = ideas.map((idea) => {
    const trades = ideaTrades(prepared, idea, startBalanceFor(input));
    return {
      name: idea.name, params: idea.params,
      train: segmentStats(trades.filter((t) => splitAt !== null && t.openedAt < splitAt)),
      test: segmentStats(trades.filter((t) => splitAt === null || t.openedAt >= splitAt)),
    };
  });
  return { rows, from, splitAt, to };
}

const startBalanceFor = (input: { startBalance?: number }) => input.startBalance ?? 10_000;
