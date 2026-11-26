import { describe, it, expect } from "vitest";
import { GLOSSARY, glossaryEntry, GLOSSARY_GROUPS } from "@/lib/glossary";
import { profitFactorNote } from "@/lib/glossary";
import { mnT, translator } from "@/lib/i18n";

describe("glossary", () => {
  it("every entry has a url-safe unique id and text in both languages", () => {
    const ids = GLOSSARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of GLOSSARY) {
      expect(e.id).toMatch(/^[a-z0-9-]+$/);
      for (const s of [e.term.mn, e.term.en]) expect(s.trim().length).toBeGreaterThan(0);
      for (const s of [e.def.mn, e.def.en]) expect(s.trim().length).toBeGreaterThan(20);
    }
  });

  it("covers the terms the pages put a hint on", () => {
    for (const id of ["ema", "pivot", "atr", "rsi", "r", "rr", "lot", "win-rate", "profit-factor", "drawdown", "pnl", "fvg", "liquidity", "stop-loss", "take-profit", "demo", "sample"]) {
      expect(glossaryEntry(id as never), id).toBeDefined();
    }
  });

  it("every entry sits in exactly one group on the glossary page", () => {
    const grouped = GLOSSARY_GROUPS.flatMap((g) => g.ids);
    expect(grouped.slice().sort()).toEqual(GLOSSARY.map((e) => e.id).sort());
  });

  it("explains a lot in dollars per dollar of gold move, the way a beginner sizes a trade", () => {
    expect(glossaryEntry("lot").def.mn).toMatch(/100 унц/);
    expect(glossaryEntry("lot").def.mn).toMatch(/0\.01 лот/);
  });
});

describe("profitFactorNote", () => {
  it("says the profit factor in plain money terms", () => {
    expect(profitFactorNote(1.89, mnT)).toBe("Алдсан $1 тутамд $1.89 олсон");
    expect(profitFactorNote(1.89, translator("en"))).toBe("$1.89 made for every $1 lost");
  });
  it("calls a factor below 1 what it is", () => {
    expect(profitFactorNote(0.8, mnT)).toBe("Алдсан $1 тутамд $0.80 олсон: нийтдээ алдагдалтай");
  });
  it("explains why there is no figure", () => {
    expect(profitFactorNote(null, mnT)).toMatch(/алдагдалтай арилжаа/i);
  });
});
