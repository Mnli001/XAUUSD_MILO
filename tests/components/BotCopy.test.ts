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
const CONNECT = "src/components/BotConnect.tsx";
const PAGE = "src/app/(app)/bot/page.tsx";
const FILES = [PANEL, CONNECT, PAGE];

describe("the Bot page speaks only of the Setup signals, in plain words", () => {
  it("names none of the retired or hidden tools", () => {
    for (const f of FILES) expect(texts(f).filter((s) => /scalper|day trader|basket|\bReading\b|Дүгнэлт|^"Багц"$|Багц дохио|Багц хэрэгсэл/i.test(s)), f).toEqual([]);
  });
  it("uses no indicator jargon", () => {
    for (const f of FILES) expect(readFileSync(f, "utf8"), f).not.toMatch(/\b(EMA|RSI|ATR|FVG|MSS)\b|sweep/);
  });
  it("offers no entry-filter form or presets", () => {
    const panel = readFileSync(PANEL, "utf8");
    expect(panel).not.toMatch(/name="g[A-Z]|name="preset"|saveGateAction|saveBotConfigAction/);
  });
});

describe("one track record and one robot version", () => {
  const panel = readFileSync(PANEL, "utf8");
  it("carries no hardcoded tester results of its own (the record comes from BROKER_RECORD)", () => {
    expect(panel).not.toMatch(/1\.59|1\.43|146 арилжаа|2024 онд Profit Factor/);
  });
  it("takes the robot version the Setup signals need from the server", () => {
    expect(panel).not.toMatch(/GATE_ROBOT\s*=|v2\.80|v3\.10\b/);
    expect(readFileSync(PAGE, "utf8")).toMatch(/minRobotVersion\("ASIAN"\)/);
  });
  it("describes the system from the session rules: three setups, up to three a day", () => {
    expect(readFileSync(PAGE, "utf8")).toMatch(/SESSION_RULES\.map\(\(r\) => ruleLine\(r, describe\(r, v\)\.name, v\)\)/);
    expect(texts(PANEL).some((s) => /өдөрт 3 хүртэл/.test(s))).toBe(true);
  });
});
