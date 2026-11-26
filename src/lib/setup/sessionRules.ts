/**
 * The session-range breakouts the system trades. Each takes the high and low of a session's opening range
 * (UTC hours), then the first 15-minute close outside it, before `entryTo`, in the direction the daily and
 * 4-hour trends agree on. Stop at the middle of the range, target `rr` times the stop, at least `minStopAtr`
 * of the daily ATR. Settings were picked per session on the broker's 2019–2022 history and judged untouched on
 * 2023 → (scripts/session-portfolio-research.ts). A London 07–09 rule passed there but lost on the site's own
 * candles with the news filter (scripts/session-site-check.ts, profit factor 0.86), so it was left out.
 */
export type SessionId = "asian-breakout" | "ny-open-breakout" | "ny-late-breakout";
export type SessionRule = {
  id: SessionId;
  rangeFrom: number; // UTC hour the opening range starts (fractions allowed: 12.5 = 12:30)
  rangeTo: number; // UTC hour it ends
  entryTo: number; // breakouts count until this UTC hour
  rr: number;
  minStopAtr: number;
  exit: "same20" | "next07"; // flat at 20:00 UTC that day, or held to 07:00 UTC the next day
  minBars: number; // a range with fewer 15-minute candles is incomplete
};

export const SESSION_RULES: readonly SessionRule[] = [
  { id: "asian-breakout", rangeFrom: 0, rangeTo: 7, entryTo: 12, rr: 3, minStopAtr: 0.25, exit: "same20", minBars: 20 },
  { id: "ny-open-breakout", rangeFrom: 12.5, rangeTo: 13.5, entryTo: 18, rr: 2, minStopAtr: 0.25, exit: "same20", minBars: 3 },
  { id: "ny-late-breakout", rangeFrom: 13.5, rangeTo: 14.5, entryTo: 17, rr: 2, minStopAtr: 0.25, exit: "next07", minBars: 3 },
];
export const SESSION_IDS = SESSION_RULES.map((r) => r.id);
export const ruleOf = (id: string): SessionRule | undefined => SESSION_RULES.find((r) => r.id === id);

/** When a trade from this rule's range on `dayKey` (UTC date) is closed by time. Fridays always close at 20:00 UTC. */
export function ruleExitAt(rule: Pick<SessionRule, "exit">, dayKey: string): Date {
  const d = Date.parse(`${dayKey}T00:00:00Z`);
  const friday = new Date(d).getUTCDay() === 5;
  return new Date(d + (rule.exit === "same20" || friday ? 20 : 31) * 36e5);
}

/** "15:30" style UTC clock text for a fractional hour, used to build viewer-clock times. */
export const hourUtc = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
