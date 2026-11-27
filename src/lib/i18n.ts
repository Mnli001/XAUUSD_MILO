import templateList from "../locales/templates.json";

/** Every language the site can be read in. Mongolian and English are written beside each other in the code
 *  (t("Тохиргоо", "Settings")); the others are looked up from src/locales/<code>.json by the English wording. */
export const LOCALES = ["mn", "en", "ru", "zh", "ja", "ko", "es", "de", "fr", "tr", "pt", "it", "id", "vi", "th", "hi", "pl", "uk", "nl", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language under its own name, the way its readers look for it in a list. */
export const LOCALE_NAMES: Record<Locale, string> = { // i18n-ok: names of languages, each written in itself
  mn: "Монгол", en: "English", ru: "Русский", zh: "中文", ja: "日本語", ko: "한국어", es: "Español", de: "Deutsch", // i18n-ok
  fr: "Français", tr: "Türkçe", pt: "Português", it: "Italiano", id: "Bahasa Indonesia", vi: "Tiếng Việt", th: "ไทย", // i18n-ok
  hi: "हिन्दी", pl: "Polski", uk: "Українська", nl: "Nederlands", ar: "العربية", // i18n-ok
};

/** Languages written right to left. */
export const RTL: ReadonlySet<Locale> = new Set<Locale>(["ar"]);
export const dirOf = (locale: Locale): "rtl" | "ltr" => (RTL.has(locale) ? "rtl" : "ltr");

/** Text kept in both languages, for values that are built once and shown to people with different settings. */
export type Text = { mn: string; en: string };

/** `t("Тохиргоо", "Settings")` — both wordings sit side by side where they are used. */
export type T = (mn: string, en: string) => string;

/** A translation file: the hash of an English wording → that wording in one language. Templates keep {0}, {1}, …. */
export type Catalog = Record<string, string>;

/** 32-bit FNV-1a as 8 hex digits; scripts/i18n-extract.mjs keys the wordings with the same function. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Template = { h: string; re: RegExp; order: number[] };
/** Wordings built from parts (`${n} days`): the finished string is matched back to its template. Longest fixed text first,
 *  so "Pro plan" is read as "{0} plan" rather than by a looser pattern. */
const TEMPLATES: Template[] = (templateList as { h: string; en: string }[])
  .map(({ h, en }) => {
    const order: number[] = [];
    const parts = en.split(/\{(\d+)\}/);
    let src = "";
    parts.forEach((p, i) => {
      if (i % 2 === 1) { order.push(Number(p)); src += "([\\s\\S]*?)"; } else src += escapeRe(p);
    });
    return { h, re: new RegExp(`^${src}$`), order, fixed: parts.filter((_, i) => i % 2 === 0).join("").length };
  })
  .sort((a, b) => b.fixed - a.fixed)
  .map(({ h, re, order }) => ({ h, re, order }));

const catalogs = new Map<Locale, Catalog>();
const memo = new Map<Locale, Map<string, string>>();
const MEMO_MAX = 4000;

/** Makes one language's translations available; done once on the server for all, and on the client for the reader's. */
export function registerCatalog(locale: Locale, catalog: Catalog): void {
  if (catalogs.get(locale) === catalog) return;
  catalogs.set(locale, catalog);
  memo.delete(locale);
}

/** The English wording in `locale`, or the English itself when it has not been translated yet. */
export function translate(locale: Locale, en: string): string {
  const cat = catalogs.get(locale);
  if (!cat || !en) return en;
  let m = memo.get(locale);
  if (!m) memo.set(locale, (m = new Map()));
  const hit = m.get(en);
  if (hit !== undefined) return hit;
  let out = cat[hashText(en)];
  if (out === undefined) {
    out = en;
    for (const tp of TEMPLATES) {
      const found = tp.re.exec(en);
      if (!found) continue;
      const pattern = cat[tp.h];
      if (pattern === undefined) break; // the best match has no translation yet: keep the English
      const vals = new Map<number, string>(tp.order.map((n, i) => [n, found[i + 1]]));
      out = pattern.replace(/\{(\d+)\}/g, (all, n) => vals.get(Number(n)) ?? all);
      break;
    }
  }
  if (m.size >= MEMO_MAX) m.clear();
  m.set(en, out);
  return out;
}

export const mnT: T = (mn) => mn;
export const enT: T = (_mn, en) => en;
const translators = new Map<Locale, T>();
export function translator(locale: Locale): T {
  if (locale === "mn") return mnT;
  if (locale === "en") return enT;
  let t = translators.get(locale);
  if (!t) translators.set(locale, (t = (_mn, en) => translate(locale, en)));
  return t;
}
export const pick = (locale: Locale, text: Text): string => translator(locale)(text.mn, text.en);

/** The best of our languages for an Accept-Language header: Mongolian if the reader has it at all, else their first
 *  supported preference, else English. No header at all (a script, a link preview) keeps the site's own Mongolian. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header?.trim()) return "mn";
  const wanted = header.split(",").map((part, i) => {
    const [tag, ...params] = part.trim().split(";");
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    return { base: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) || 0 : 1, i };
  }).filter((w) => w.base && w.q > 0).sort((a, b) => b.q - a.q || a.i - b.i);
  if (wanted.some((w) => w.base === "mn")) return "mn";
  for (const w of wanted) if ((LOCALES as readonly string[]).includes(w.base)) return w.base as Locale;
  return "en";
}
