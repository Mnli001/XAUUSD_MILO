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

/** Below this balance (dollars) a standard account is too small for XAUUSD even at 0.01 lot. */
export const SMALL_ACCOUNT_USD = 500;
/** The session setups' stops usually sit $10–20 from the entry; $15 is the middle used to judge an account. */
export const SETUP_STOP = { low: 10, mid: 15, high: 20 } as const;
/** The robot skips a session trade when 0.01 lot would risk more than this many times the chosen risk (XauBot v3.92). */
export const SMALL_ACCOUNT_X = 2.5;

/** What 0.01 lot risks, as % of the balance, with a stop `stop` dollars away. */
export const minLotRiskPct = (balance: number, stop: number) => r2(((MIN_LOT * OZ_PER_LOT * stop) / balance) * 100);

/**
 * When the account is too small for the chosen risk: under SMALL_ACCOUNT_USD, or when 0.01 lot with a typical setup
 * stop risks more than the chosen % (`riskPct`, null for fixed-lot sizing). Gives the range 0.01 lot risks; null when fine.
 */
export function smallAccount(balance: number | null, riskPct: number | null): { lowPct: number; highPct: number; midPct: number } | null {
  if (balance === null || !Number.isFinite(balance) || balance <= 0) return null;
  const midPct = minLotRiskPct(balance, SETUP_STOP.mid);
  if (balance >= SMALL_ACCOUNT_USD && !(riskPct !== null && riskPct > 0 && midPct > riskPct)) return null;
  return { lowPct: minLotRiskPct(balance, SETUP_STOP.low), highPct: minLotRiskPct(balance, SETUP_STOP.high), midPct };
}
