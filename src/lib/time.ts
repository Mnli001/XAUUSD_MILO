const UB_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Ulaanbaatar is UTC+8 with no DST

export type Session = "Ази" | "Лондон" | "Нью-Йорк" | "Завсар";

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
  if (h >= 8 && h <= 14) return "Ази";
  if (h >= 15 && h <= 20) return "Лондон";
  if (h >= 21 || h <= 4) return "Нью-Йорк";
  return "Завсар";
}
