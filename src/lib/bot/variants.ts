import { type BacktestInput, buildSignals, runBacktest } from "./backtest";
import { type BotParams, DEFAULT_PARAMS } from "./strategy";

export type Variant = { name: string; params: BotParams };
const v = (name: string, o: Partial<BotParams> = {}): Variant => ({ name, params: { ...DEFAULT_PARAMS, ...o } });

/**
 * The rule variants to compare. This list is fixed before looking at results; adding variants
 * after seeing the numbers is how a backtest gets fitted to the past.
 */
export const VARIANTS: Variant[] = [
  v("Анхны дүрэм"), // i18n-ok: server log, machine reply or research-script name
  v("Тэг рүү зөөхгүй", { breakeven: false }), // i18n-ok: server log, machine reply or research-script name
  v("Зөвхөн Нью-Йорк (21–01)", { sessionStartUb: 21, sessionEndUb: 1 }), // i18n-ok: server log, machine reply or research-script name
  v("Зөвхөн Лондон (15–21)", { sessionStartUb: 15, sessionEndUb: 21 }), // i18n-ok: server log, machine reply or research-script name
  v("Өндөр босго (оноо 60)", { minBias: 60 }), // i18n-ok: server log, machine reply or research-script name
  v("1ц мөн тохирсон", { requireH1Agree: true }), // i18n-ok: server log, machine reply or research-script name
  v("Target 1.5×", { rr: 1.5 }),
  v("Target 3×", { rr: 3 }),
  v("Өргөн stop (ATR×2)", { atrMult: 2 }), // i18n-ok: server log, machine reply or research-script name
  v("Нарийн stop (ATR×1)", { atrMult: 1 }), // i18n-ok: server log, machine reply or research-script name
  v("Тэг рүү зөөхгүй + target 3×", { breakeven: false, rr: 3 }), // i18n-ok: server log, machine reply or research-script name
  v("Тэг рүү зөөхгүй + Нью-Йорк", { breakeven: false, sessionStartUb: 21, sessionEndUb: 1 }), // i18n-ok: server log, machine reply or research-script name
  v("Оноо 60 + 1ц тохирсон + тэг рүү зөөхгүй", { minBias: 60, requireH1Agree: true, breakeven: false }), // i18n-ok: server log, machine reply or research-script name
];

export type SegmentStats = { n: number; winRate: number | null; profitFactor: number | null; avgR: number | null; totalR: number; maxDrawdownR: number };
export type VariantRow = { name: string; params: BotParams; train: SegmentStats; test: SegmentStats };

/** Statistics in R multiples (profit ÷ initial risk), so they do not depend on account size. */
export function segmentStats(trades: { r: number }[]): SegmentStats {
  let wins = 0, gain = 0, loss = 0, total = 0, peak = 0, maxDd = 0;
  for (const { r } of trades) {
    if (r > 0) { wins++; gain += r; } else loss -= r;
    total += r;
    peak = Math.max(peak, total);
    maxDd = Math.max(maxDd, peak - total);
  }
  const n = trades.length;
  return { n, winRate: n ? (wins / n) * 100 : null, profitFactor: loss > 0 ? gain / loss : null, avgR: n ? total / n : null, totalR: total, maxDrawdownR: maxDd };
}

export const TRAIN_FRACTION = 2 / 3;
export const MIN_TRAIN_TRADES = 40;
export const MIN_TEST_TRADES = 20;
export const MIN_TEST_AVG_R = 0.1;
export const MIN_TEST_PROFIT_FACTOR = 1.2;

/** Runs every variant over the whole history and splits its trades at the same point in time. */
export function compareVariants(input: Omit<BacktestInput, "params">, variants: Variant[] = VARIANTS): { rows: VariantRow[]; from: Date | null; splitAt: Date | null; to: Date | null } {
  const { readyFrom } = buildSignals({ ...input, params: DEFAULT_PARAMS });
  const from = readyFrom >= 0 ? input.m15[readyFrom].time : null;
  const to = input.m15.at(-1)?.time ?? null;
  const splitAt = from && to ? new Date(from.getTime() + (to.getTime() - from.getTime()) * TRAIN_FRACTION) : null;
  const rows = variants.map(({ name, params }) => {
    const { trades } = runBacktest({ ...input, params });
    return {
      name,
      params,
      train: segmentStats(trades.filter((t) => splitAt !== null && t.openedAt < splitAt)),
      test: segmentStats(trades.filter((t) => splitAt === null || t.openedAt >= splitAt)),
    };
  });
  return { rows, from, splitAt, to };
}

/** The single variant chosen from the training part only: best average R with enough trades. */
export function pickBest(rows: VariantRow[]): VariantRow | null {
  const ok = rows.filter((r) => r.train.n >= MIN_TRAIN_TRADES && r.train.avgR !== null && r.train.avgR > 0);
  return ok.sort((a, b) => b.train.avgR! - a.train.avgR!)[0] ?? null;
}

/** Does the chosen variant hold up on the part of history it was not chosen on? */
export function passesValidation(test: SegmentStats): boolean {
  return test.n >= MIN_TEST_TRADES && test.avgR !== null && test.avgR >= MIN_TEST_AVG_R && (test.profitFactor === null || test.profitFactor >= MIN_TEST_PROFIT_FACTOR);
}
