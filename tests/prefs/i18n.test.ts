import { describe, expect, it } from "vitest";
import { translator, mnT, pick } from "@/lib/i18n";
import { parseLocale, parseTheme, parseTimeZone, DEFAULT_PREFS, TIME_ZONES } from "@/lib/prefs";

describe("translator", () => {
  it("returns the Mongolian text for mn and the English text for en", () => {
    expect(translator("mn")("Тохиргоо", "Settings")).toBe("Тохиргоо");
    expect(translator("en")("Тохиргоо", "Settings")).toBe("Settings");
    expect(mnT("Журнал", "Journal")).toBe("Журнал");
  });
  it("picks one side of a stored two-language text", () => {
    expect(pick("en", { mn: "Ази", en: "Asia" })).toBe("Asia");
    expect(pick("mn", { mn: "Ази", en: "Asia" })).toBe("Ази");
  });
});

describe("preference parsing", () => {
  it("accepts the site's languages and falls back to Mongolian", () => {
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("mn")).toBe("mn");
    expect(parseLocale("xx")).toBe("mn");
    expect(parseLocale(undefined)).toBe("mn");
  });
  it("accepts dark, light and system and falls back to dark", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme("pink")).toBe("dark");
  });
  it("accepts a real IANA zone and falls back to Ulaanbaatar", () => {
    expect(parseTimeZone("Europe/London")).toBe("Europe/London");
    expect(parseTimeZone("Mars/Olympus")).toBe("Asia/Ulaanbaatar");
    expect(parseTimeZone("")).toBe("Asia/Ulaanbaatar");
  });
  it("defaults to Mongolian, dark, Ulaanbaatar and offers Ulaanbaatar in the zone list", () => {
    expect(DEFAULT_PREFS).toEqual({ locale: "mn", theme: "dark", timeZone: "Asia/Ulaanbaatar" });
    expect(TIME_ZONES).toContain("Asia/Ulaanbaatar");
    expect(TIME_ZONES).toContain("UTC");
  });
});
