import type { SetupHistory, SetupStatus } from "./setups";

/** Most actionable first: an entry that is live, then one waiting for its trigger, then one still building, then nothing. */
const STATUS_RANK: Record<SetupStatus, number> = { ACTIVE: 0, WATCH: 1, FORMING: 2, OFF: 3 };

/** Orders by status only; rules with the same status keep their fixed order (never ranked by past win rate). */
export function orderSetups<S extends { status: SetupStatus }>(setups: readonly S[]): S[] {
  return setups.map((s, i) => [s, i] as const).sort((a, b) => STATUS_RANK[a[0].status] - STATUS_RANK[b[0].status] || a[1] - b[1]).map(([s]) => s);
}

/** Fewer trades than this and a record says nothing (the same floor the record cards use). */
export const MIN_TRADES = 30;

/**
 * The rule with the best average result per trade over the last 12 months, or null.
 * Average R, not win rate: a high win rate with small wins and large losses can still lose money.
 * Needs at least two rules with enough trades to compare, a positive best, and no tie.
 */
export function bestRecent<S extends { id: string; recent: SetupHistory }>(setups: readonly S[]): { id: string; avgR: number } | null {
  const ok = setups
    .filter((s) => s.recent.n >= MIN_TRADES && s.recent.avgR !== null)
    .map((s) => ({ id: s.id, avgR: s.recent.avgR as number }))
    .sort((a, b) => b.avgR - a.avgR);
  if (ok.length < 2 || ok[0].avgR <= 0 || ok[0].avgR === ok[1].avgR) return null;
  return ok[0];
}
