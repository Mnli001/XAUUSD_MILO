export type EventType = {
  type: string;
  title: string;
  country: "АНУ";
  impact: "HIGH" | "MEDIUM";
  nyTime: string; // New York wall-clock release time, HH:mm
  fredReleaseId: number | null; // null = entered by an admin
};

/**
 * Release ids come from https://api.stlouisfed.org/fred/releases — run `npm run check-fred`
 * with a FRED_API_KEY to confirm each id still names the release written next to it.
 */
export const EVENT_TYPES: EventType[] = [
  { type: "CPI", title: "Хэрэглээний үнийн индекс (CPI)", country: "АНУ", impact: "HIGH", nyTime: "08:30", fredReleaseId: 10 },
  { type: "NFP", title: "Ажил эрхлэлтийн тайлан (NFP)", country: "АНУ", impact: "HIGH", nyTime: "08:30", fredReleaseId: 50 },
  { type: "GDP", title: "ДНБ (GDP)", country: "АНУ", impact: "HIGH", nyTime: "08:30", fredReleaseId: 53 },
  { type: "PCE", title: "PCE инфляци", country: "АНУ", impact: "HIGH", nyTime: "08:30", fredReleaseId: 54 },
  { type: "PPI", title: "Үйлдвэрлэгчийн үнийн индекс (PPI)", country: "АНУ", impact: "MEDIUM", nyTime: "08:30", fredReleaseId: 46 },
  { type: "RETAIL", title: "Жижиглэн худалдаа", country: "АНУ", impact: "MEDIUM", nyTime: "08:30", fredReleaseId: 9 },
  { type: "FOMC", title: "ХНС-ийн бодлогын хүү (FOMC)", country: "АНУ", impact: "HIGH", nyTime: "14:00", fredReleaseId: null },
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
