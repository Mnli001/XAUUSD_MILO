import type { Candle } from "./analysis/indicators";
import { ruleExitAt, ruleOf } from "./setup/sessionRules";

/** Signals before the session rules (2026-11-27) used the old Asian exit; the rule's own exit applies after. */
const RULES_FROM = Date.UTC(2026, 10, 27);

/**
 * How a recorded signal ended, judged on 15-minute candles the way the Setup replay judges it: the first bar to
 * touch the stop or the target decides, a bar touching both counts as the stop, and an Asian breakout still open
 * at 20:00 UTC (04:00 Ulaanbaatar) is closed at that bar's close. Other rules have no time exit.
 */
export type SignalLike = { setupId: string; side: string; entry: number; stop: number; target: number; createdAt: Date };
export type Outcome = { kind: "WIN" | "LOSS" | "TIME" | "OPEN"; r: number | null; at: Date | null };

const M15 = 15 * 6e4;
const EXIT_UTC_HOUR = 20;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** The first 20:00 UTC after `t`. */
function asianDeadline(t: Date): Date {
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), EXIT_UTC_HOUR));
  return d.getTime() > t.getTime() ? d : new Date(d.getTime() + 864e5);
}

export function signalOutcome(s: SignalLike, bars: readonly Candle[], now: Date): Outcome {
  const dir = s.side === "BUY" ? 1 : -1;
  const risk = Math.abs(s.entry - s.stop);
  if (!(risk > 0)) return { kind: "OPEN", r: null, at: null };
  // The signal is recorded just after its breakout bar closes; the bar running at that moment is the first after entry.
  const from = Math.floor(s.createdAt.getTime() / M15) * M15;
  const rule = ruleOf(s.setupId);
  const deadline = rule ? (rule.id === "asian-breakout" && s.createdAt.getTime() < RULES_FROM ? asianDeadline(s.createdAt) : ruleExitAt(rule, s.createdAt.toISOString().slice(0, 10))).getTime() : Infinity;
  let last: Candle | null = null;
  for (const b of bars) {
    const t = b.time.getTime();
    if (t < from) continue;
    if (t >= deadline) break;
    const stopped = dir > 0 ? b.low <= s.stop : b.high >= s.stop;
    const reached = dir > 0 ? b.high >= s.target : b.low <= s.target;
    const at = new Date(t + M15);
    if (stopped) return { kind: "LOSS", r: -1, at };
    if (reached) return { kind: "WIN", r: round2(Math.abs(s.target - s.entry) / risk), at };
    last = b;
  }
  if (now.getTime() >= deadline && last) {
    return { kind: "TIME", r: round2((dir * (last.close - s.entry)) / risk), at: new Date(last.time.getTime() + M15) };
  }
  return { kind: "OPEN", r: null, at: null };
}

export type OutcomeTotals = { closed: number; wins: number; losses: number; open: number; totalR: number; winPct: number | null };

/** Wins are closed trades that made money (a time exit in profit counts); losses the rest. */
export function outcomeTotals(outcomes: readonly Outcome[]): OutcomeTotals {
  const out: OutcomeTotals = { closed: 0, wins: 0, losses: 0, open: 0, totalR: 0, winPct: null };
  for (const o of outcomes) {
    if (o.kind === "OPEN" || o.r === null) { out.open++; continue; }
    out.closed++;
    out.totalR += o.r;
    if (o.r > 0) out.wins++; else out.losses++;
  }
  out.totalR = round2(out.totalR);
  if (out.closed > 0) out.winPct = Math.round((out.wins / out.closed) * 100);
  return out;
}
