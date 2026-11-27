/**
 * The live system's backtest (src/data/backtest-curves.json, written by scripts/export-equity-curves.ts; method and
 * caveats in docs/backtest-curves.md), typed and with the few figures the public pages read from it.
 * Pure, no database: client components may import it.
 */
import raw from "@/data/backtest-curves.json";
import { SESSION_RULES } from "./setup/sessionRules";

export type CurvePoint = { m: string; eq: number };
export type RiskCurve = { risk: number; finalPct: number; cagr: number; maxDD: number; worstMonth: number; bestMonth: number; monthly: CurvePoint[] };
export type YearRow = { year: number; trades: number; r: number; winRate: number };
export type BacktestCurves = {
  generatedAt: string;
  source: string;
  spread: number;
  start: number;
  stats: { trades: number; perWeek: number; winRate: number; avgR: number; profitFactor: number; bestYearR: number; worstYearR: number };
  years: YearRow[];
  risks: RiskCurve[];
};

export const CURVES: BacktestCurves = raw;

/** The risk the hero quotes: its closed-trade drawdown stays near 11%. */
export const HERO_RISK = 1.5;

export const riskCurve = (risk: number, c: BacktestCurves = CURVES): RiskCurve => c.risks.find((r) => r.risk === risk) ?? c.risks[0];

/** The closed balance at the last month end. */
export const finalBalance = (r: RiskCurve): number => r.monthly.at(-1)?.eq ?? 0;

/** "2019–2026", from the first and last month in the file. */
export function spanLabel(c: BacktestCurves = CURVES): string {
  const m = c.risks[0]?.monthly ?? [];
  return `${m[0]?.m.slice(0, 4) ?? ""}–${m.at(-1)?.m.slice(0, 4) ?? ""}`;
}

/** The smallest and largest target the rules aim for, in R. */
export function rrRange(): [number, number] {
  const rr = SESSION_RULES.map((r) => r.rr);
  return [Math.min(...rr), Math.max(...rr)];
}
/** "1:2–1:3" */
export function rrLabel(): string {
  const [lo, hi] = rrRange();
  return lo === hi ? `1:${lo}` : `1:${lo}–1:${hi}`;
}

/** "$6,494" */
export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
/** "+333%" (whole) or "−5.61%" (two decimals) with a real minus sign. */
export const signedPct = (n: number, digits = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
/** "+33.1R" */
export const signedR = (n: number, digits = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}R`;

/** The fall from the highest month end so far, in % (≤ 0), for each month: the underwater line. */
export function underwater(monthly: readonly CurvePoint[]): number[] {
  let peak = -Infinity;
  return monthly.map((p) => {
    peak = Math.max(peak, p.eq);
    return peak > 0 ? ((p.eq - peak) / peak) * 100 : 0;
  });
}
