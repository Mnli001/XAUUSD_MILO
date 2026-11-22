import { translator, type Locale, type T } from "./i18n";
import { DEFAULT_PREFS, DEFAULT_TIME_ZONE } from "./prefs";
import { formatDateTime, formatTime, ubDateKey, ubLocalToUtc, zoneDateKey } from "./time";

/** Who is looking: their language and their clock. Text and times that people read are built through this. */
export type Viewer = {
  locale: Locale;
  timeZone: string;
  t: T;
  time: (d: Date) => string; // 15:05
  dateTime: (d: Date) => string; // 2026-11-24 15:05
  date: (d: Date) => string; // 2026-11-24
  zone: string; // a short name for the clock: УБ, UB, London
  /** A fixed Ulaanbaatar time of day (the rules are written in it), on the viewer's clock: ub("15:00") is "07:00" in London. */
  ub: (hhmm: string) => string;
};

function zoneName(timeZone: string, t: T): string {
  if (timeZone === DEFAULT_TIME_ZONE) return t("УБ", "UB");
  return timeZone.slice(timeZone.lastIndexOf("/") + 1).replaceAll("_", " ");
}

export function viewer(p: { locale: Locale; timeZone: string }): Viewer {
  const t = translator(p.locale);
  return {
    locale: p.locale,
    timeZone: p.timeZone,
    t,
    time: (d) => formatTime(d, p.timeZone),
    dateTime: (d) => formatDateTime(d, p.timeZone),
    date: (d) => zoneDateKey(d, p.timeZone),
    zone: zoneName(p.timeZone, t),
    ub: (hhmm) => (p.timeZone === DEFAULT_TIME_ZONE ? hhmm : formatTime(ubLocalToUtc(ubDateKey(new Date()), hhmm), p.timeZone)),
  };
}

export const MN_VIEWER = viewer(DEFAULT_PREFS);
