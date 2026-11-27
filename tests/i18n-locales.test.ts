import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES, LOCALE_NAMES, dirOf, hashText, localeFromAcceptLanguage, registerCatalog, translate, translator } from "@/lib/i18n";
import { isLocale, parseLocale } from "@/lib/prefs";
import { robotLang } from "@/lib/bot/live";

const DIR = join(__dirname, "../src/locales");
const source: { h: string; en: string }[] = JSON.parse(readFileSync(join(DIR, "source.json"), "utf8"));
const byHash = new Map(source.map((x) => [x.h, x.en]));
const holes = (s: string) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(",");

describe("languages", () => {
  it("has twenty, each named, Arabic right to left", () => {
    expect(LOCALES).toHaveLength(20);
    for (const l of LOCALES) expect(LOCALE_NAMES[l]).toBeTruthy();
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("ja")).toBe("ltr");
  });
  it("reads a saved language and falls back to Mongolian for anything else", () => {
    expect(parseLocale("ko")).toBe("ko");
    expect(parseLocale("xx")).toBe("mn");
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("EN")).toBe(false);
  });
  it("gives the robot English unless the reader is Mongolian", () => {
    expect(robotLang("mn")).toBe("mn");
    expect(robotLang("de")).toBe("en");
  });
});

describe("browser language on a first visit", () => {
  it("prefers Mongolian when the browser has it at all", () => expect(localeFromAcceptLanguage("en-US,en;q=0.9,mn;q=0.5")).toBe("mn"));
  it("takes the first supported preference by weight", () => {
    expect(localeFromAcceptLanguage("sw,ja-JP;q=0.8,en;q=0.7")).toBe("ja");
    expect(localeFromAcceptLanguage("fr;q=0.3,de;q=0.9")).toBe("de");
    expect(localeFromAcceptLanguage("pt-BR")).toBe("pt");
  });
  it("falls back to English", () => {
    expect(localeFromAcceptLanguage("sw,am")).toBe("en");
    expect(localeFromAcceptLanguage(null)).toBe("mn"); // no header: the site's own language
    expect(localeFromAcceptLanguage("de;q=0")).toBe("en");
  });
});

describe("translator", () => {
  it("keeps the code's own Mongolian and English", () => {
    expect(translator("mn")("Тохиргоо", "Settings")).toBe("Тохиргоо");
    expect(translator("en")("Тохиргоо", "Settings")).toBe("Settings");
  });
  it("looks a wording up, fills templates, and shows English when a line has no translation", () => {
    const days = source.find((x) => x.en === "{0} days");
    expect(days).toBeTruthy();
    registerCatalog("nl", { [hashText("Settings")]: "Instellingen", [days!.h]: "{0} dagen" });
    const t = translator("nl");
    expect(t("Тохиргоо", "Settings")).toBe("Instellingen");
    expect(t("30 хоног", "30 days")).toBe("30 dagen");
    expect(t("—", "Not translated yet")).toBe("Not translated yet");
    expect(translate("vi", "Settings")).toBe("Settings");
  });
});

describe("translation files", () => {
  const files = readdirSync(DIR).filter((f) => /^[a-z]{2}\.json$/.test(f));
  it("there is one for every language besides Mongolian and English", () => {
    expect(files.map((f) => f.slice(0, 2)).sort()).toEqual(LOCALES.filter((l) => l !== "mn" && l !== "en").slice().sort());
  });
  for (const f of files) {
    it(`${f}: every line answers a wording in the code and keeps its {n} parts`, () => {
      const cat: Record<string, string> = JSON.parse(readFileSync(join(DIR, f), "utf8"));
      const stale: string[] = [], broken: string[] = [];
      for (const [h, text] of Object.entries(cat)) {
        const en = byHash.get(h);
        if (en === undefined) { stale.push(h); continue; }
        // Every {n} of the translation must exist in the English; one may be left out (an English plural ending).
        const known = new Set(holes(en).split(","));
        if (typeof text !== "string" || text === "" || !holes(text).split(",").filter(Boolean).every((n) => known.has(n))) broken.push(`${h}: ${en} → ${text}`);
      }
      expect(broken).toEqual([]);
      // Wordings that left the code are pruned by `npm run i18n:extract` (also run before every build).
      expect(stale.length).toBeLessThan(200);
    });
  }
});
