import { type Candle, type Timeframe, ema, rsi, macdHist } from "../analysis/indicators";
import { MIN_CANDLES, combineBias } from "../analysis/bias";
import { ubHour } from "../time";

export type Side = "BUY" | "SELL";

export type BotParams = {
  minBias: number; // |weighted bias| needed to trade
  sessionStartUb: number; // first UB hour traded
  sessionEndUb: number; // first UB hour NOT traded (wraps past midnight)
  atrMult: number; // stop distance = ATR(14, 15min) × atrMult
  rr: number; // target distance = stop distance × rr
  riskPct: number; // % of balance risked per trade
  maxTradesPerDay: number;
  dailyLossPct: number; // stop for the UB day at this loss
  maxDrawdownPct: number; // kill switch: peak-to-trough drop that halts the bot
  newsBeforeMin: number;
  newsAfterMin: number;
  spread: number; // USD, charged on entry
  breakeven: boolean; // move the stop to entry at +1R
  requireH1Agree: boolean; // the 1h score must point the same way too
};

export const DEFAULT_PARAMS: BotParams = {
  minBias: 40, sessionStartUb: 15, sessionEndUb: 1, atrMult: 1.5, rr: 2, riskPct: 0.5,
  maxTradesPerDay: 2, dailyLossPct: 1, maxDrawdownPct: 5, newsBeforeMin: 30, newsAfterMin: 60, spread: 0.3,
  breakeven: true, requireH1Agree: false,
};

export function inSession(t: Date, p: BotParams): boolean {
  const h = ubHour(t);
  return p.sessionStartUb <= p.sessionEndUb ? h >= p.sessionStartUb && h < p.sessionEndUb : h >= p.sessionStartUb || h < p.sessionEndUb;
}

export function inNewsWindow(t: Date, news: Date[], p: BotParams): boolean {
  const ms = t.getTime();
  return news.some((n) => ms >= n.getTime() - p.newsBeforeMin * 6e4 && ms <= n.getTime() + p.newsAfterMin * 6e4);
}

/** Trade only with a strong weighted bias that the daily and 4h charts both agree with. */
export function directionFromScores(scores: Partial<Record<Timeframe, number | null>>, p: BotParams): Side | null {
  const bias = combineBias(scores);
  const d = scores["1day"];
  const h4 = scores["4h"];
  if (!bias || d === null || d === undefined || h4 === null || h4 === undefined) return null;
  const h1 = scores["1h"];
  const h1Up = !p.requireH1Agree || (h1 !== null && h1 !== undefined && h1 > 0);
  const h1Down = !p.requireH1Agree || (h1 !== null && h1 !== undefined && h1 < 0);
  if (bias.total >= p.minBias && d > 0 && h4 > 0 && h1Up) return "BUY";
  if (bias.total <= -p.minBias && d < 0 && h4 < 0 && h1Down) return "SELL";
  return null;
}

/** The bar dipped to EMA20 and closed back on the trend side, in the trend direction. */
export function pullbackSignal(bar: Candle, ema20: number, side: Side): boolean {
  if (Number.isNaN(ema20)) return false;
  return side === "BUY"
    ? bar.low <= ema20 && bar.close > ema20 && bar.close > bar.open
    : bar.high >= ema20 && bar.close < ema20 && bar.close < bar.open;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * timeframeScore for every bar, using only that bar and earlier ones.
 * series[i] === timeframeScore(candles.slice(0, i + 1)).
 */
export function scoreSeries(candles: Candle[]): (number | null)[] {
  const n = candles.length;
  const closes = candles.map((c) => c.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const r = rsi(closes);
  const m = macdHist(closes);
  const isHigh = new Array<boolean>(n).fill(false);
  const isLow = new Array<boolean>(n).fill(false);
  for (let g = 1; g < n - 1; g++) {
    isHigh[g] = candles[g].high > candles[g - 1].high && candles[g].high > candles[g + 1].high;
    isLow[g] = candles[g].low < candles[g - 1].low && candles[g].low < candles[g + 1].low;
  }
  const out = new Array<number | null>(n).fill(null);
  for (let i = MIN_CANDLES - 1; i < n; i++) {
    const close = closes[i];
    let s = 0;
    s += close > e50[i] ? 20 : -20;
    s += close > e200[i] ? 20 : -20;
    s += e20[i] > e20[i - 5] ? 10 : -10;
    s += clamp((r[i] - 50) / 20, -1, 1) * 15;
    s += m[i] > 0 ? 15 : -15;
    // swings inside the last 120 bars; a fractal needs the bar after it, so the newest candidate is i − 1
    const first = Math.max(0, i - 119) + 1;
    const highs: number[] = [];
    const lows: number[] = [];
    for (let g = i - 1; g >= first && (highs.length < 2 || lows.length < 2); g--) {
      if (isHigh[g] && highs.length < 2) highs.push(candles[g].high);
      if (isLow[g] && lows.length < 2) lows.push(candles[g].low);
    }
    if (highs.length === 2 && lows.length === 2) {
      // highs[0] / lows[0] are the most recent
      if (highs[0] > highs[1] && lows[0] > lows[1]) s += 20;
      else if (highs[0] < highs[1] && lows[0] < lows[1]) s -= 20;
    }
    out[i] = s;
  }
  return out;
}
