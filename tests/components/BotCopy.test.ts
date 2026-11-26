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

describe("one track record and one robot version", () => {
  const panel = readFileSync(PANEL, "utf8");
  it("carries no hardcoded tester results of its own (the record comes from BROKER_RECORD)", () => {
    expect(panel).not.toMatch(/1\.59|1\.43|146 арилжаа|2024 онд Profit Factor/);
  });
  it("takes robot versions from the server instead of its own constant", () => {
    expect(panel).not.toMatch(/GATE_ROBOT\s*=/);
    expect(panel).not.toMatch(/v2\.80|v3\.10\b/);
    expect(readFileSync(PAGE, "utf8")).toMatch(/minRobotVersion/);
  });
  it("describes the Setup signals tool from the session rules: three setups, up to three a day", () => {
    expect(readFileSync(PAGE, "utf8")).toMatch(/SESSION_RULES\.map\(\(r\) => ruleLine\(r, describe\(r, v\)\.name, v\)\)/);
    expect(texts(PANEL).some((s) => /өдөрт 3 хүртэл/.test(s))).toBe(true);
  });
});
