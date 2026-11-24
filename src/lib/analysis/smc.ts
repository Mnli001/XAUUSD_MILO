import type { Candle } from "./indicators";

/**
 * The day-trade pattern, on closed 15-minute candles:
 *   1. liquidity: a recent swing low (for a long) that stops would sit under;
 *   2. sweep: a candle trades through it and price closes back above within a few bars;
 *   3. shift (MSS): price then closes above the last swing high before the sweep;
 *   4. zone: the nearest fair value gap left by that move up, or the last down candle before it (order block);
 *   5. return and reaction: price comes back into the zone and a candle closes back above it.
 * The stop goes under the sweep's low or under the zone; the target is a fixed multiple of the risk,
 * or the nearest resting liquidity (an untouched swing high above a long, swing low below a short).
 * Shorts are the mirror image. Everything is decided on closed candles, so nothing here looks ahead.
 */
export type SmcSide = "BUY" | "SELL";
export type SmcZoneKind = "FVG" | "OB";
export type SmcSetup = {
  side: SmcSide;
  /** Index of the candle whose close triggers the entry. */
  at: number;
  entry: number;
  stop: number;
  target: number;
  risk: number;
  level: number; // the liquidity that was swept
  sweepAt: number;
  shiftAt: number;
  zone: { kind: SmcZoneKind; top: number; bottom: number };
  /** The resting liquidity the target was put on (BSL above a long, SSL below a short); null with a fixed-RR target. */
  pool: number | null;
};
export type SmcOptions = {
  swing: number; // candles on each side that make a swing point
  lookback: number; // how far back a liquidity level may be
  reclaimBars: number; // candles the sweep has to close back within
  shiftBars: number; // candles after the sweep for the shift
  returnBars: number; // candles after the shift for the return to the zone
  reaction: boolean; // true: enter on a close back out of the zone; false: enter on the touch
  rr: number;
  stopBuffer: number; // dollars beyond the sweep extreme
  minRisk: number; // skip setups whose stop is closer than this
  maxRisk: number; // ...or further than this
  /** "sweep": stop beyond the sweep's extreme. "zone": stop just beyond the FVG / order block. */
  stopAt: "sweep" | "zone";
  /** "rr": target at rr × risk. "liquidity": target at the nearest unswept swing high (BSL) above a long, swing low (SSL) below a short. */
  targetAt: "rr" | "liquidity";
  /** With a liquidity target: skip the trade when the pool is closer than this many R (not worth the risk). */
  minRR: number;
  /** With a liquidity target: cap it at this many R when the nearest pool is further away. */
  maxRR: number;
};
export const SMC_DEFAULTS: SmcOptions = { swing: 2, lookback: 96, reclaimBars: 2, shiftBars: 12, returnBars: 16, reaction: true, rr: 2, stopBuffer: 0.3, minRisk: 2, maxRisk: 40, stopAt: "sweep", targetAt: "rr", minRR: 1.5, maxRR: 4 };

type Bar = { o: number; h: number; l: number; c: number };

/** Long setups on bars. Shorts are found by flipping the prices and calling this again. */
function longs(b: Bar[], o: SmcOptions): Omit<SmcSetup, "side">[] {
  const n = b.length, k = o.swing, out: Omit<SmcSetup, "side">[] = [];
  const swingLow: boolean[] = new Array(n).fill(false), swingHigh: boolean[] = new Array(n).fill(false);
  for (let i = k; i < n - k; i++) {
    let lo = true, hi = true;
    for (let j = 1; j <= k; j++) {
      if (!(b[i].l < b[i - j].l && b[i].l <= b[i + j].l)) lo = false;
      if (!(b[i].h > b[i - j].h && b[i].h >= b[i + j].h)) hi = false;
    }
    swingLow[i] = lo; swingHigh[i] = hi;
  }
  let busyUntil = -1;
  for (let s = k + 2; s < n; s++) {
    if (s <= busyUntil) continue;
    // 1–2. The nearest confirmed swing low that this candle trades through.
    let lv = -1;
    for (let i = s - k - 1; i >= Math.max(k, s - o.lookback); i--) {
      if (!swingLow[i]) continue;
      if (b[s].l < b[i].l && b[s - 1].l >= b[i].l) lv = i;
      break; // only the most recent swing low counts as "the" liquidity
    }
    if (lv < 0) continue;
    const level = b[lv].l;
    let reclaim = -1, low = b[s].l;
    for (let r = s; r <= Math.min(n - 1, s + o.reclaimBars); r++) { low = Math.min(low, b[r].l); if (b[r].c > level) { reclaim = r; break; } }
    if (reclaim < 0) continue;
    // 3. The last swing high before the sweep is what a shift has to close above.
    let ref = -1;
    for (let i = s - k - 1; i >= Math.max(k, lv - o.lookback); i--) if (swingHigh[i]) { ref = i; break; }
    if (ref < 0 || b[ref].h <= level) continue;
    let shift = -1;
    for (let m = reclaim; m <= Math.min(n - 1, s + o.shiftBars); m++) { if (b[m].l < low) { low = b[m].l; } if (b[m].c > b[ref].h) { shift = m; break; } }
    if (shift < 0) continue;
    // 4. The nearest gap the move up left, else the last down candle before it.
    let zone: SmcSetup["zone"] | null = null;
    for (let i = shift; i >= s + 2 && i >= 2; i--) if (b[i].l > b[i - 2].h) { zone = { kind: "FVG", top: b[i].l, bottom: b[i - 2].h }; break; }
    if (!zone) for (let i = shift - 1; i >= s - 1 && i >= 0; i--) if (b[i].c < b[i].o) { zone = { kind: "OB", top: b[i].o, bottom: b[i].l }; break; }
    if (!zone || zone.top <= zone.bottom) continue;
    // 5. The return into the zone, then (optionally) a close back above it.
    for (let x = shift + 1; x <= Math.min(n - 1, shift + o.returnBars); x++) {
      if (b[x].l < low) break; // the sweep's low gave way: the idea is dead
      if (b[x].l > zone.top) continue; // not back in the zone yet
      const reacted = b[x].c > zone.top && b[x].c > b[x].o;
      if (o.reaction && !reacted) continue;
      const entry = o.reaction ? b[x].c : zone.top;
      const stop = (o.stopAt === "zone" ? Math.min(zone.bottom, b[x].l) : low) - o.stopBuffer, risk = entry - stop;
      if (risk < o.minRisk || risk > o.maxRisk) break;
      let target = entry + o.rr * risk, pool: number | null = null;
      if (o.targetAt === "liquidity") {
        // The nearest swing high above the entry that price has not traded through since it formed: buy-side liquidity.
        let best = Infinity;
        for (let i = x - k; i >= Math.max(k, x - 4 * o.lookback); i--) {
          if (!swingHigh[i] || b[i].h <= entry) continue;
          let taken = false;
          for (let j = i + 1; j <= x; j++) if (b[j].h >= b[i].h) { taken = true; break; }
          if (!taken && b[i].h < best) best = b[i].h;
        }
        if (!Number.isFinite(best)) break; // no pool above: nothing to aim at
        const rr = (best - entry) / risk;
        if (rr < o.minRR) break;
        pool = best;
        target = entry + Math.min(rr, o.maxRR) * risk;
      }
      out.push({ at: x, entry, stop, target, risk, level, sweepAt: s, shiftAt: shift, zone, pool });
      busyUntil = x;
      break;
    }
  }
  return out;
}

/** Every setup in the series, in time order. */
export function findSmcSetups(candles: Candle[], opts: Partial<SmcOptions> = {}): SmcSetup[] {
  const o = { ...SMC_DEFAULTS, ...opts };
  const up: Bar[] = candles.map((c) => ({ o: c.open, h: c.high, l: c.low, c: c.close }));
  const down: Bar[] = candles.map((c) => ({ o: -c.open, h: -c.low, l: -c.high, c: -c.close }));
  const buys = longs(up, o).map((s) => ({ ...s, side: "BUY" as const }));
  const sells = longs(down, o).map((s) => ({
    ...s, side: "SELL" as const, entry: -s.entry, stop: -s.stop, target: -s.target, level: -s.level, pool: s.pool === null ? null : -s.pool,
    zone: { kind: s.zone.kind, top: -s.zone.bottom, bottom: -s.zone.top },
  }));
  return [...buys, ...sells].sort((a, b) => a.at - b.at);
}
