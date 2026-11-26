import type { T } from "../i18n";
export type EventType = {
  type: string;
  title: string; titleEn: string;
  country: "АНУ"; // i18n-ok: a stored key, shown through its label function
  impact: "HIGH" | "MEDIUM";
  nyTime: string; // New York wall-clock release time, HH:mm
  fredReleaseId: number | null; // null = entered by an admin
};

/**
 * Release ids come from https://api.stlouisfed.org/fred/releases — run `npm run check-fred`
 * with a FRED_API_KEY to confirm each id still names the release written next to it.
 */
/**
 * FOMC decision days (the second day of each meeting; the statement comes at 14:00 New York). FRED does not publish
 * these, so they are copied from https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm (last update
 * 2026-11-18). 2027 dates are tentative until confirmed at the meeting before. Add next year's when the Fed posts them.
 * Checked again 2026-11-27: the Fed's 2027 list has eight meetings and its last is November 16-17; there is no
 * December 2027 meeting (the next is January 25-26, 2028), so 2027 is complete as written.
 */
export const FOMC_DECISION_DAYS = [
  "2024-01-31", "2024-03-20", "2024-05-01", "2024-06-12", "2024-07-31", "2024-09-18", "2024-11-07", "2024-12-18",
  "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-10",
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-10-27", "2027-11-17",
] as const;

export const EVENT_TYPES: EventType[] = [
  { type: "CPI", title: "Хэрэглээний үнийн индекс (CPI)", titleEn: "Consumer Price Index (CPI)", country: "АНУ", impact: "HIGH", nyTime: "08:30", fredReleaseId: 10 }, // i18n-ok: a stored key, shown through its label function
  { type: "NFP", title: "Ажил эрхлэлтийн тайлан (NFP)", titleEn: "Jobs report (NFP)", country: "АНУ", impact: "HIGH", nyTime: "08:30", fredReleaseId: 50 }, // i18n-ok: a stored key, shown through its label function
  { type: "GDP", title: "ДНБ (GDP)", titleEn: "GDP", country: "АНУ", impact: "HIGH", nyTime: "08:30", fredReleaseId: 53 }, // i18n-ok: a stored key, shown through its label function
  { type: "PCE", title: "PCE инфляци", titleEn: "PCE inflation", country: "АНУ", impact: "HIGH", nyTime: "08:30", fredReleaseId: 54 }, // i18n-ok: a stored key, shown through its label function
  { type: "PPI", title: "Үйлдвэрлэгчийн үнийн индекс (PPI)", titleEn: "Producer Price Index (PPI)", country: "АНУ", impact: "MEDIUM", nyTime: "08:30", fredReleaseId: 46 }, // i18n-ok: a stored key, shown through its label function
  { type: "RETAIL", title: "Жижиглэн худалдаа", titleEn: "Retail sales", country: "АНУ", impact: "MEDIUM", nyTime: "08:30", fredReleaseId: 9 }, // i18n-ok: a stored key, shown through its label function
  { type: "FOMC", title: "ХНС-ийн бодлогын хүү (FOMC)", titleEn: "Fed policy rate (FOMC)", country: "АНУ", impact: "HIGH", nyTime: "14:00", fredReleaseId: null }, // i18n-ok: a stored key, shown through its label function
];

export interface CalendarProvider {
  fetchEvents(from: Date, to: Date): Promise<{ type: string; time: Date }[]>;
}

const nyFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** America/New_York wall time -> UTC instant (daylight saving aware). */
export function nyLocalToUtc(dateKey: string, hhmm: string): Date {
  const asUtc = new Date(`${dateKey}T${hhmm}:00Z`).getTime();
  const p = Object.fromEntries(nyFormat.formatToParts(new Date(asUtc)).map((x) => [x.type, x.value]));
  const nyWall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return new Date(asUtc + (asUtc - nyWall));
}

/** A release's name in the viewer's language; a title an admin typed by hand is shown as typed. */
export function eventTitle(e: { type: string; title: string }, t: T): string {
  const known = EVENT_TYPES.find((x) => x.type === e.type);
  return known && e.title === known.title ? t(known.title, known.titleEn) : e.title;
}
export const countryName = (country: string, t: T): string => (country === "АНУ" ? t("АНУ", "US") : country); // i18n-ok: compared with the stored value
