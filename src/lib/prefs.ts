import { LOCALES, type Locale } from "./i18n";

export type Theme = "dark" | "light" | "system";
export const THEMES: Theme[] = ["dark", "light", "system"];
export type Prefs = { locale: Locale; theme: Theme; timeZone: string };

export const DEFAULT_TIME_ZONE = "Asia/Ulaanbaatar";
export const DEFAULT_PREFS: Prefs = { locale: "mn", theme: "dark", timeZone: DEFAULT_TIME_ZONE };

/** The zones offered in Settings: where traders of this market usually sit, west to east. */
export const TIME_ZONES = [
  "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Toronto", "America/Mexico_City", "America/Bogota", "America/Sao_Paulo", "America/Argentina/Buenos_Aires",
  "UTC", "Europe/London", "Europe/Lisbon", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Zurich",
  "Europe/Warsaw", "Europe/Athens", "Europe/Kyiv", "Europe/Istanbul", "Europe/Moscow", "Africa/Lagos", "Africa/Cairo",
  "Africa/Johannesburg", "Africa/Nairobi", "Asia/Dubai", "Asia/Tehran", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka",
  "Asia/Almaty", "Asia/Bangkok", "Asia/Jakarta", "Asia/Ho_Chi_Minh", "Asia/Hovd", "Asia/Ulaanbaatar", "Asia/Shanghai",
  "Asia/Hong_Kong", "Asia/Singapore", "Asia/Kuala_Lumpur", "Asia/Manila", "Asia/Taipei", "Australia/Perth", "Asia/Seoul",
  "Asia/Tokyo", "Australia/Adelaide", "Australia/Brisbane", "Australia/Sydney", "Pacific/Auckland",
];

export const COOKIE = { locale: "xau_locale", theme: "xau_theme", timeZone: "xau_tz" } as const;

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
export const parseLocale = (v: unknown): Locale => (isLocale(v) ? v : "mn");
export const isTheme = (v: unknown): v is Theme => v === "dark" || v === "light" || v === "system";
export const parseTheme = (v: unknown): Theme => (isTheme(v) ? v : "dark");

export function isTimeZone(v: unknown): v is string {
  if (typeof v !== "string" || v === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}
export const parseTimeZone = (v: unknown): string => (isTimeZone(v) ? v : DEFAULT_TIME_ZONE);
