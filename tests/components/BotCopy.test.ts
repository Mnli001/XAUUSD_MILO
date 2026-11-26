import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/** Every `t("…", "…")` text in a file, Mongolian and English. */
function texts(file: string): string[] {
  const code = readFileSync(file, "utf8");
  const out: string[] = [];
  const call = /\bt\(\s*("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)\s*,\s*("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)\s*\)/g;
  for (const m of code.matchAll(call)) out.push(m[1], m[2]);
  return out;
}

const PANEL = "src/components/BotPanel.tsx";
const PAGE = "src/app/(app)/bot/page.tsx";

describe("bot page copy matches the tools that exist", () => {
  it("never tells the owner about the retired Scalper tool", () => {
    for (const f of [PANEL, PAGE]) expect(texts(f).filter((s) => /scalper/i.test(s)), f).toEqual([]);
  });

  it("does not offer the site-stops switch, which no current tool reads", () => {
    expect(readFileSync(PANEL, "utf8")).not.toMatch(/name="gSiteStops"/);
  });

  it("says which tools the winner protection works for", () => {
    const protect = texts(PANEL).filter((s) => /\+1R/.test(s));
    expect(protect.some((s) => /Day trader/.test(s) && /Дүгнэлт/.test(s))).toBe(true);
  });
});
