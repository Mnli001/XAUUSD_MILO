import { formatUbDateTime, formatDateTime } from "./time";

export const usd = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pnlClass = (v: number) => (v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-zinc-300");
/** UTC instant -> value for <input type="datetime-local"> in UB time. */
export const toUbInput = (d: Date | null) => (d ? formatUbDateTime(d).replace(" ", "T") : "");
/** A datetime-local value on the viewer's own clock. */
export const toZoneInput = (d: Date | null, timeZone: string) => (d ? formatDateTime(d, timeZone).replace(" ", "T") : "");
