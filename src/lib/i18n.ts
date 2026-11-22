export type Locale = "mn" | "en";
export const LOCALES: Locale[] = ["mn", "en"];

/** Text kept in both languages, for values that are built once and shown to people with different settings. */
export type Text = { mn: string; en: string };

/** `t("Тохиргоо", "Settings")` — both wordings sit side by side where they are used. */
export type T = (mn: string, en: string) => string;

export const mnT: T = (mn) => mn;
export const enT: T = (_mn, en) => en;
export const translator = (locale: Locale): T => (locale === "en" ? enT : mnT);
export const pick = (locale: Locale, text: Text): string => text[locale];
