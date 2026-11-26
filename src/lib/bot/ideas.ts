import { type Candle, rsi, atrSeries } from "../analysis/indicators";
import { type BacktestInput, type Order, alignClosed, simulateOrders } from "./backtest";
import { type BotParams, DEFAULT_PARAMS, inNewsWindow, scoreSeries } from "./strategy";
import { type VariantRow, segmentStats, TRAIN_FRACTION } from "./variants";
import { type SessionRule, SESSION_RULES, ruleExitAt } from "../setup/sessionRules";

const M15 = 15 * 6e4;
const decisionTime = (bar: Candle) => new Date(bar.time.getTime() + M15);
type Score = number | null;

/**
 * A session-range breakout (lib/setup/sessionRules.ts) replayed: the opening range of `rule`, the first close
 * outside it before `entryTo` in the direction both trends agree on (outside news windows), stop at the middle,
 * `rr` times the stop as target, flat at the rule's time exit. The first qualifying breakout decides the day:
 * one from a range narrower than `minStopAtr` of the daily ATR is passed.
 */
export function sessionOrders(m15: Candle[], rule: SessionRule, o: { news: Date[]; params: BotParams; trend: Score[]; confirm: Score[]; atr: number[]; onNews?: "wait" | "skip" | "ignore" }): (Order | null)[] {
  const out: (Order | null)[] = new Array(m15.length).fill(null);
  let day = "", high = -Infinity, low = Infinity, count = 0, done = false;
  m15.forEach((bar, i) => {
    const key = bar.time.toISOString().slice(0, 10);
    if (key !== day) { day = key; high = -Infinity; low = Infinity; count = 0; done = false; }
    const h = bar.time.getUTCHours() + bar.time.getUTCMinutes() / 60;
    if (h >= rule.rangeFrom && h < rule.rangeTo) { high = Math.max(high, bar.high); low = Math.min(low, bar.low); count++; return; }
    if (done || h < rule.rangeTo || h >= rule.entryTo || count < rule.minBars) return;
    const side = bar.close > high ? "BUY" : bar.close < low ? "SELL" : null;
    if (!side) return;
    const at = decisionTime(bar);
    const mode = o.onNews ?? "wait";
    const inNews = mode !== "ignore" && inNewsWindow(at, o.news, o.params);
    if (inNews && mode === "wait") return; // passed over: the next close outside the range may still be taken
    for (const series of [o.trend, o.confirm]) {
      const t = series[i];
      if (t === null || t === undefined || (side === "BUY" ? t <= 0 : t >= 0)) return;
    }
    done = true;
    if (inNews) return; // "skip": a breakout made inside a news window ends the day for this range
    const stopDist = Math.abs(bar.close - (high + low) / 2);
    const maxBars = Math.floor((ruleExitAt(rule, key).getTime() - at.getTime()) / M15);
    if (!(stopDist > 0) || maxBars < 1 || !(stopDist >= rule.minStopAtr * o.atr[i])) return;
    out[i] = { side, stopDist, targetDist: stopDist * rule.rr, maxBars };
  });
  return out;
}

/**
 * Idea 1 — Asian range breakout. The range is the high/low of 00:00–07:00 UTC (08:00–15:00 UB).
 * Between 07:00 and 16:00 UTC the first 15-minute close outside the range is followed, with the
 * stop at the middle of the range, and the trade is flat by 20:00 UTC. One trade per day.
 */
export function asianRangeOrders(m15: Candle[], o: { rr: number; news: Date[]; params: BotParams; trend?: Score[]; confirm?: Score[]; minStop?: { atr: number[]; k: number }; windowEnd?: number; holdOvernight?: boolean }): (Order | null)[] {
  const out: (Order | null)[] = new Array(m15.length).fill(null);
  let day = "";
  let high = -Infinity, low = Infinity, count = 0, done = false;
  m15.forEach((bar, i) => {
    const key = bar.time.toISOString().slice(0, 10);
    if (key !== day) { day = key; high = -Infinity; low = Infinity; count = 0; done = false; }
    const hour = bar.time.getUTCHours();
    if (hour < 7) { high = Math.max(high, bar.high); low = Math.min(low, bar.low); count++; return; }
    if (done || count < 20 || hour >= (o.windowEnd ?? 16)) return;
    const side = bar.close > high ? "BUY" : bar.close < low ? "SELL" : null;
    if (!side) return;
    const at = decisionTime(bar);
    if (inNewsWindow(at, o.news, o.params)) return;
    if (o.trend) {
      const t = o.trend[i];
      if (t === null || t === undefined || (side === "BUY" ? t <= 0 : t >= 0)) return;
    }
    if (o.confirm) {
      const t = o.confirm[i];
      if (t === null || t === undefined || (side === "BUY" ? t <= 0 : t >= 0)) return;
    }
    const stopDist = Math.abs(bar.close - (high + low) / 2);
    // Flat at 20:00 UTC, or (holdOvernight) at 07:00 UTC the next day, when the next Asian range has formed.
    const closeAt = Date.UTC(bar.time.getUTCFullYear(), bar.time.getUTCMonth(), bar.time.getUTCDate(), o.holdOvernight ? 31 : 20);
    const maxBars = Math.floor((closeAt - at.getTime()) / M15);
    if (stopDist <= 0 || maxBars < 1) return;
    // A breakout from a range too narrow for the day's usual move is noise: the day is passed.
    if (o.minStop && !(stopDist >= o.minStop.k * o.minStop.atr[i])) { done = true; return; }
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

type Context = { m15: Candle[]; rsi15: number[]; atr15: number[]; daily: Score[]; h4: Score[]; atrD: number[]; news: Date[] };
export type Idea = { name: string; params: BotParams; build: (c: Context) => (Order | null)[] };

const base: BotParams = { ...DEFAULT_PARAMS, breakeven: false };
const oneADay: BotParams = { ...base, maxTradesPerDay: 1 };
// The order builder already allows one trade per UTC day. The simulator counts days on the Ulaanbaatar
// clock, where a 16:00 UTC entry falls on the next day and would block that day's trade, so it is not asked to.
/** The Asian rule passes a day whose stop (half the range plus the breakout) is under this share of the daily ATR. */
export const ASIAN_MIN_STOP_ATR = 0.25;
const asianDay: BotParams = { ...base, maxTradesPerDay: 2 };
/** Records of a rule are in R; a balance this size never rounds a wide-stop day down to under 0.01 lot and skips it. */
export const RECORD_BALANCE = 1_000_000;

/** Fixed before looking at any result: three different kinds of entry, two settings each. */
export const IDEAS: Idea[] = [
  { name: "Азийн хүрээний breakout", params: oneADay, build: (c) => asianRangeOrders(c.m15, { rr: 2, news: c.news, params: oneADay }) }, // i18n-ok: server log, machine reply or research-script name
  { name: "Азийн хүрээний breakout + өдрийн тренд", params: oneADay, build: (c) => asianRangeOrders(c.m15, { rr: 2, news: c.news, params: oneADay, trend: c.daily }) }, // i18n-ok: server log, machine reply or research-script name
  { name: "Трендийн доторх уналтыг авах (RSI 30)", params: base, build: (c) => dipOrders(c.m15, { ...c, params: base, rsiLow: 30 }) }, // i18n-ok: server log, machine reply or research-script name
  { name: "Трендийн доторх уналтыг авах (RSI 25)", params: base, build: (c) => dipOrders(c.m15, { ...c, params: base, rsiLow: 25 }) }, // i18n-ok: server log, machine reply or research-script name
  { name: "Мэдээний дараах хөдөлгөөнийг дагах", params: base, build: (c) => newsOrders(c.m15, { atr15: c.atr15, news: c.news, rr: 2 }) }, // i18n-ok: server log, machine reply or research-script name
  { name: "Мэдээний дараах хөдөлгөөний эсрэг", params: base, build: (c) => newsOrders(c.m15, { atr15: c.atr15, news: c.news, rr: 1, fade: true }) }, // i18n-ok: server log, machine reply or research-script name
  // Added 2026-11-26 after the all-history check (scripts/asian-deep-check.ts): asking the 4-hour trend to agree
  // and aiming for 3R each improved BOTH halves of the history, not just the whole.
  { name: "Азийн breakout + өдөр, 4 цагийн тренд, 3R", params: asianDay, build: (c) => asianRangeOrders(c.m15, { rr: 3, news: c.news, params: oneADay, trend: c.daily, confirm: c.h4 }) }, // i18n-ok: server log, machine reply or research-script name
  // Added 2026-11-26 after the broker's own history 2019 → (scripts/broker-research.ts): passing days whose stop
  // is under a quarter of the daily ATR helped both 2019–22 (chosen there) and 2023 → (untouched).
  { name: "Азийн breakout + тренд, 3R, stop ≥ 0.25 өдрийн ATR", params: asianDay, build: (c) => asianRangeOrders(c.m15, { rr: 3, news: c.news, params: asianDay, trend: c.daily, confirm: c.h4, minStop: { atr: c.atrD, k: ASIAN_MIN_STOP_ATR } }) }, // i18n-ok: server log, machine reply or research-script name
];
/** The Asian rule the Setup page, the Telegram signals and the robot's Asian tool all follow. */
export const ASIAN_IDEA = IDEAS[7];
/** The four session rules as replayable ideas, in SESSION_RULES order (the records on the Setup page). */
export const SESSION_IDEAS: Idea[] = SESSION_RULES.map((rule) => ({ name: rule.id, params: asianDay, build: (c) => sessionOrders(c.m15, rule, { news: c.news, params: oneADay, trend: c.daily, confirm: c.h4, atr: c.atrD, onNews: "skip" }) }));
/** Candidate (2026-11-26, scripts/asian-improve-research.ts): breakouts before 12:00 UTC only, held to 07:00 UTC next day. */
export const ASIAN_IDEA_V4: Idea = { name: "Азийн breakout v4: 12:00 UTC хүртэл, шөнө барих", params: asianDay, build: (c) => asianRangeOrders(c.m15, { rr: 3, news: c.news, params: oneADay, trend: c.daily, confirm: c.h4, minStop: { atr: c.atrD, k: ASIAN_MIN_STOP_ATR }, windowEnd: 12, holdOvernight: true }) }; // i18n-ok: server log, machine reply or research-script name

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
    atrD: alignClosed(decisions, d1, atrSeries(d1), "1day").map((x) => x ?? NaN),
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
