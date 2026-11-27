/**
 * The session-range breakouts the system trades. Each takes the high and low of a session's opening range
 * (UTC hours), then the first 15-minute close outside it, before `entryTo`, in the direction the daily and
 * 4-hour trends agree on. Stop at the middle of the range, target `rr` times the stop, at least `minStopAtr`
 * of the daily ATR. Settings were picked per session on the broker's 2019–2022 history and judged untouched on
 * 2023 → (scripts/session-portfolio-research.ts). A London 07–09 rule passed there but lost on the site's own
 * candles with the news filter (scripts/session-site-check.ts, profit factor 0.86), so it was left out.
 * The New York rules also need a daily trend score of at least 35: on broker data that raised the average R in
 * both 2019–22 (+0.115 → +0.166) and 2023 → (+0.169 → +0.219); 25 and 45 also helped, the Asian rule did not
 * gain from it (scripts/improve-7-research.ts).
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
  /** The daily trend score must be at least this strong (absolute) at the breakout; a weaker one ends the day. 0 = sign only. */
  minDailyScore: number;
};

export const SESSION_RULES: readonly SessionRule[] = [
  { id: "asian-breakout", rangeFrom: 0, rangeTo: 7, entryTo: 12, rr: 3, minStopAtr: 0.25, exit: "same20", minBars: 20, minDailyScore: 0 },
  { id: "ny-open-breakout", rangeFrom: 12.5, rangeTo: 13.5, entryTo: 18, rr: 2, minStopAtr: 0.25, exit: "same20", minBars: 3, minDailyScore: 35 },
  { id: "ny-late-breakout", rangeFrom: 13.5, rangeTo: 14.5, entryTo: 17, rr: 2, minStopAtr: 0.25, exit: "next07", minBars: 3, minDailyScore: 35 },
];
/**
 * How big a session trade is against the owner's chosen risk, from the trends at the breakout: ×1.25 when the
 * daily and 4-hour scores are both at least 65 (strong), ×0.75 when either is below 35 (weak), ×1 otherwise.
 * At equal maximum drawdown it raised the yearly return in both 2019–22 and 2023 → on broker data
 * (scripts/xau-alpha-research.ts); most of the gain is from smaller trades when the 4-hour trend is weak.
 */
export const SIZE_STRONG = 65, SIZE_WEAK = 35, SIZE_UP = 1.25, SIZE_DOWN = 0.75;
export function sizeFactor(daily: number | null, h4: number | null): number {
  const d = Math.abs(daily ?? 0), h = Math.abs(h4 ?? 0);
  if (d < SIZE_WEAK || h < SIZE_WEAK) return SIZE_DOWN;
  if (d >= SIZE_STRONG && h >= SIZE_STRONG) return SIZE_UP;
  return 1;
}
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
