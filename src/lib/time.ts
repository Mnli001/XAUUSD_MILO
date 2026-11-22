import type { T } from "./i18n";
const UB_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Ulaanbaatar is UTC+8 with no DST

export type Session = "Ази" | "Лондон" | "Нью-Йорк" | "Завсар"; // i18n-ok: a stored key, shown through its label function

function shifted(d: Date): Date {
  return new Date(d.getTime() + UB_OFFSET_MS);
}

export function ubHour(d: Date): number {
  return shifted(d).getUTCHours();
}

export function ubDateKey(d: Date): string {
  return shifted(d).toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday, in UB time. */
export function ubWeekday(d: Date): number {
  const w = shifted(d).getUTCDay();
  return w === 0 ? 7 : w;
}

/** UB wall-clock date + time -> UTC instant. */
export function ubLocalToUtc(dateKey: string, hhmm: string): Date {
  return new Date(new Date(`${dateKey}T${hhmm}:00Z`).getTime() - UB_OFFSET_MS);
}

export function formatUbTime(d: Date): string {
  return shifted(d).toISOString().slice(11, 16);
}

export function formatUbDateTime(d: Date): string {
  const s = shifted(d).toISOString();
  return `${s.slice(0, 10)} ${s.slice(11, 16)}`;
}

export function sessionOfUbHour(h: number): Session {
  if (h >= 8 && h <= 14) return "Ази"; // i18n-ok: a stored key, shown through its label function
  if (h >= 15 && h <= 20) return "Лондон"; // i18n-ok: a stored key, shown through its label function
  if (h >= 21 || h <= 4) return "Нью-Йорк"; // i18n-ok: a stored key, shown through its label function
  return "Завсар"; // i18n-ok: a stored key, shown through its label function
}

/** The trading session's name in the viewer's language. */
export function sessionLabel(s: string, t: T): string {
  switch (s) {
    case "Ази": return t("Ази", "Asia"); // i18n-ok: the stored key on the left
    case "Лондон": return t("Лондон", "London"); // i18n-ok
    case "Нью-Йорк": return t("Нью-Йорк", "New York"); // i18n-ok
    case "Завсар": return t("Завсар", "Off-hours"); // i18n-ok
    default: return s;
  }
}

// ---- Any time zone (what a user picked in Settings) ----

const formatters = new Map<string, Intl.DateTimeFormat>();
function wallClock(d: Date, timeZone: string): { date: string; time: string } {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    formatters.set(timeZone, f);
  }
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export const formatTime = (d: Date, timeZone: string): string => wallClock(d, timeZone).time;
export const zoneDateKey = (d: Date, timeZone: string): string => wallClock(d, timeZone).date;
export function formatDateTime(d: Date, timeZone: string): string {
  const w = wallClock(d, timeZone);
  return `${w.date} ${w.time}`;
}

/** Wall-clock date + time in a zone -> the instant. */
export function zonedToUtc(dateKey: string, hhmm: string, timeZone: string): Date {
  const wanted = new Date(`${dateKey}T${hhmm}:00Z`).getTime();
  let guess = wanted;
  for (let i = 0; i < 2; i++) { // the second pass settles a guess that fell across a daylight-saving change
    const w = wallClock(new Date(guess), timeZone);
    guess += wanted - new Date(`${w.date}T${w.time}:00Z`).getTime();
  }
  return new Date(guess);
}

/** The hourly statistics are bucketed by Ulaanbaatar hour; this is the same hour on the viewer's clock. */
export function zoneHourOfUbHour(ubHourOfDay: number, timeZone: string, now: Date): string {
  return formatTime(ubLocalToUtc(ubDateKey(now), `${String(ubHourOfDay).padStart(2, "0")}:00`), timeZone);
}

/** How far the zone's clock is ahead of UTC at that instant, in milliseconds (charts draw wall-clock time). */
export function zoneShiftMs(d: Date, timeZone: string): number {
  const w = wallClock(d, timeZone);
  return new Date(`${w.date}T${w.time}:00Z`).getTime() - Math.floor(d.getTime() / 6e4) * 6e4;
}

/** 1 = Monday … 7 = Sunday, on the zone's calendar. */
export function zoneWeekday(d: Date, timeZone: string): number {
  const w = new Date(`${zoneDateKey(d, timeZone)}T00:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

export function weekdayName(n: number, t: T): string {
  return ["", t("Даваа", "Monday"), t("Мягмар", "Tuesday"), t("Лхагва", "Wednesday"), t("Пүрэв", "Thursday"), t("Баасан", "Friday"), t("Бямба", "Saturday"), t("Ням", "Sunday")][n] ?? "";
}
