import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GOLD_PLACEHOLDER, INSTALLER_FILENAME, PS_MARKER, installerBat, installerScript, presetLines, presetText, psStr, startupIniLines, startupIniText } from "@/lib/bot/installer";

const input = { origin: "https://xau.example.mn", syncUrl: "https://xau.example.mn/api/bot/sync", token: "0123456789abcdef0123456789abcdef0123456789abcdef" };

test("the preset sets the robot's two inputs, named as in XauBot.mq5, with CRLF", () => {
  expect(presetLines(input.syncUrl, input.token)).toEqual([`ServerUrl=${input.syncUrl}`, `BotToken=${input.token}`]);
  expect(presetText(input.syncUrl, input.token)).toBe(`ServerUrl=${input.syncUrl}\r\nBotToken=${input.token}\r\n`);
});

test("the startup config switches algo trading on and opens a gold M15 chart with the robot and its preset", () => {
  expect(startupIniText("XAUUSD.m")).toBe([
    "[Experts]", "Enabled=1", "AllowLiveTrading=1", "AllowDllImport=0",
    "[StartUp]", "Expert=XauBot", "ExpertParameters=XauBot.set", "Symbol=XAUUSD.m", "Period=M15", "",
  ].join("\r\n"));
  // WebRequest is not set from here: MT5 does not keep it from a startup config
  expect(startupIniLines("XAUUSD").join("\n")).not.toMatch(/WebRequest/);
});

test("the script carries the preset and the startup config as literals, the gold symbol filled in when it runs", () => {
  const ps = installerScript(input);
  for (const l of presetLines(input.syncUrl, input.token)) expect(ps).toContain(psStr(l));
  for (const l of startupIniLines(GOLD_PLACEHOLDER)) expect(ps).toContain(psStr(l));
  expect(ps).toContain(`$SiteOrigin = 'https://xau.example.mn'`);
  expect(ps).toContain("/api/bot/download?file=ex5");
  expect(ps).toContain("'x-bot-token' = $BotToken");
  expect(ps).toContain("Set-Clipboard -Value $SiteOrigin");
  expect(ps).toContain("Tools → Options → Expert Advisors");
  expect(ps).toContain("Бэлэн боллоо — сайтын Bot хуудсан дээр ''Холбогдлоо ✓'' гарна"); // a quote is doubled inside '…'
  // it never stops or kills a terminal
  expect(ps).not.toMatch(/Stop-Process|taskkill|\.Kill\(/i);
});

test("a quote in a value cannot end the PowerShell string; a line break is refused", () => {
  expect(psStr("it's")).toBe("'it''s'");
  expect(() => psStr("a\r\nb")).toThrow();
  expect(() => installerScript({ ...input, origin: "https://x.mn'; Remove-Item" })).toThrow();
  expect(() => installerScript({ ...input, token: "bad token" })).toThrow();
});

test("the .bat starts with @echo off (no BOM), unpacks the lines after its marker and uses CRLF throughout", () => {
  const bat = installerBat(input);
  expect(INSTALLER_FILENAME).toBe("XauBot-Setup.bat");
  expect(bat.startsWith("@echo off\r\n")).toBe(true);
  expect(bat).not.toMatch(/(?<!\r)\n/);
  const lines = bat.split("\r\n");
  const at = lines.indexOf(PS_MARKER);
  expect(at).toBeGreaterThan(0);
  expect(lines.filter((l) => l === PS_MARKER)).toHaveLength(1);
  expect(lines.slice(at + 1).join("\r\n")).toBe(installerScript(input));
  expect(lines.slice(0, at).join("")).toMatch(/^[\x20-\x7e]*$/); // the cmd part is plain ASCII
  expect(bat).toContain("powershell -NoProfile -ExecutionPolicy Bypass -File \"%XB_PS1%\" %*");
});

test.skipIf(process.platform !== "win32")("Windows PowerShell parses the generated script without errors", () => {
  const dir = mkdtempSync(join(tmpdir(), "xaubot-ps-"));
  try {
    const file = join(dir, "setup.ps1");
    writeFileSync(file, "﻿" + installerScript(input), "utf8");
    const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
      `$e = $null; $t = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${file.replaceAll("'", "''")}', [ref]$t, [ref]$e); $e.Count`], { encoding: "utf8" });
    expect(out.trim()).toBe("0");
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30_000);
