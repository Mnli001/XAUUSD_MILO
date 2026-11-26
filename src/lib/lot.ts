/** XAUUSD: one standard lot is 100 oz, so a $1 move costs $100 a lot ($1 per 0.01 lot). */
export const OZ_PER_LOT = 100;
const MIN_LOT = 0.01;
const r2 = (x: number) => Math.round(x * 100) / 100;

export type LotResult = { lots: number; risk: number; riskPct: number; reward: number | null; belowMin: boolean };

/**
 * The lot size that risks `riskPct` of `balance` if the stop (`stop` dollars from the entry) is hit, rounded down
 * to 0.01 so the risk never exceeds the choice. If even 0.01 risks more, 0.01 is shown with what it would risk.
 * `target`: dollars from the entry to the target, for the reward.
 */
export function lotSize(i: { balance: number; riskPct: number; stop: number; target: number | null }): LotResult | null {
  const { balance, riskPct, stop, target } = i;
  if (![balance, riskPct, stop].every((x) => Number.isFinite(x) && x > 0)) return null;
  const budget = (balance * riskPct) / 100;
  // In hundredths of a lot, with a small epsilon so 0.2 does not become 0.19 from floating error.
  const hundredths = Math.floor(budget / (stop * OZ_PER_LOT * MIN_LOT) + 1e-9);
  const belowMin = hundredths < 1;
  const lots = r2(Math.max(1, hundredths) * MIN_LOT);
  const risk = lots * OZ_PER_LOT * stop;
  return {
    lots,
    risk: r2(risk),
    riskPct: r2((risk / balance) * 100),
    reward: target !== null && Number.isFinite(target) && target > 0 ? r2(lots * OZ_PER_LOT * target) : null,
    belowMin,
  };
}
