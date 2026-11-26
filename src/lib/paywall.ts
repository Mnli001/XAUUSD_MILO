import type { HourRow } from "./analysis/hourly";
import { sessionOfUbHour } from "./time";

/** The hourly table for someone without a plan: every hour and its session, no statistics at all. */
export function lockedHourRows(): HourRow[] {
  return Array.from({ length: 24 }, (_, hour) => ({ hour, session: sessionOfUbHour(hour), n: 0, upPct: null, nCond: 0, upPctCond: null, avgMove: null }));
}
