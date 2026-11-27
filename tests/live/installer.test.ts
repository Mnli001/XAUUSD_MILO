import { execFile, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { BRIDGE_MUTEX, GOLD_PLACEHOLDER, INSTALLER_FILENAME, PS_MARKER, bridgeScript, bridgeVbsLines, installerBat, installerScript, presetLines, presetText, psStr, startupIniLines, startupIniText } from "@/lib/bot/installer";

const input = { origin: "https://xau.example.mn", syncUrl: "https://xau.example.mn/api/bot/sync", token: "0123456789abcdef0123456789abcdef0123456789abcdef" };

test("the preset sets the robot's inputs, named as in XauBot.mq5 (Transport 0 = AUTO), with CRLF", () => {
  expect(presetLines(input.syncUrl, input.token)).toEqual([`ServerUrl=${input.syncUrl}`, `BotToken=${input.token}`, "Transport=0"]);
  expect(presetText(input.syncUrl, input.token)).toBe(`ServerUrl=${input.syncUrl}\r\nBotToken=${input.token}\r\nTransport=0\r\n`);
  const mq5 = readFileSync("mt5/XauBot.mq5", "utf8");
  expect(mq5).toContain("input ENUM_XAU_TRANSPORT Transport = TRANSPORT_AUTO;");
  expect(mq5).toMatch(/TRANSPORT_AUTO = 0,/);
});

test("the startup config switches algo trading on and opens a gold M15 chart with the robot and its preset", () => {
  expect(startupIniText("XAUUSD.m")).toBe([
    "[Experts]", "Enabled=1", "AllowLiveTrading=1", "AllowDllImport=0",
    "[StartUp]", "Expert=XauBot", "ExpertParameters=XauBot.set", "Symbol=XAUUSD.m", "Period=M15", "",
  ].join("\r\n"));
  // WebRequest is not set from here: MT5 does not keep it from a startup config
  expect(startupIniLines("XAUUSD").join("\n")).not.toMatch(/WebRequest/);
});

test("with no gold symbol the startup config only switches algo trading on: no chart, no robot", () => {
  expect(startupIniText()).toBe(["[Experts]", "Enabled=1", "AllowLiveTrading=1", "AllowDllImport=0", ""].join("\r\n"));
  expect(startupIniLines("").join("\n")).not.toMatch(/StartUp|Symbol=|Expert=/);
});

test("the script takes gold from the login server's own folder and says how to add the robot by hand", () => {
  const ps = installerScript(input);
  expect(ps).toContain("$IniLinesNoChart = @('[Experts]', 'Enabled=1', 'AllowLiveTrading=1', 'AllowDllImport=0')");
  expect(ps).toContain("'config\\common.ini'");
  expect(ps).toContain("'^Server\\s*=\\s*(.+)$'");
  expect(ps).toContain("Find-GoldSymbol $term.Data $login.Server");
  expect(ps).not.toContain("return 'XAUUSD'"); // no blind default any more
  // the manual steps and the one-line fallback, in both languages
  expect(ps).toContain("Drag XauBot from Navigator → Expert Advisors onto that chart.");
  expect(ps).toContain("Inputs → Load → XauBot.set");
  expect(ps).toContain("Common → tick Allow Algo Trading → OK.");
  expect(ps).toContain("If the chart shows no robot:");
  expect(ps).toContain("Чарт дээр robot харагдахгүй бол:");
});

test("the script carries the preset and the startup config as literals, the gold symbol filled in when it runs", () => {
  const ps = installerScript(input);
  for (const l of presetLines(input.syncUrl, input.token)) expect(ps).toContain(psStr(l));
  for (const l of startupIniLines(GOLD_PLACEHOLDER)) expect(ps).toContain(psStr(l));
  expect(ps).toContain(`$SiteOrigin = 'https://xau.example.mn'`);
  expect(ps).toContain("/api/bot/download?file=ex5");
  expect(ps).toContain("'x-bot-token' = $BotToken");
  expect(ps).toContain("Робот холбогдмогц сайтын Bot хуудсан дээр ''Холбогдлоо ✓'' гарна"); // a quote is doubled inside '…'
  // it never stops or kills a terminal
  expect(ps).not.toMatch(/Stop-Process|taskkill|\.Kill\(/i);
});

test("the script is hands-free: no address to paste, no Enter to press; it waits for MT5 to close by itself", () => {
  const ps = installerScript(input);
  expect(ps).not.toMatch(/Set-Clipboard|Ctrl\+V|Allow WebRequest|Wait-Enter/);
  // the only question left is which MT5, when there are several
  expect(ps.match(/Read-Host/g)).toHaveLength(1);
  expect(ps).toContain("$answer = Read-Host '  #'");
  expect(ps).toMatch(/while \(Test-Running \$term\.Exe\) \{ Start-Sleep -Seconds 2 \}/);
  expect(ps).toContain("the install goes on by itself as soon as it has closed");
  // the uninstall note, in both languages
  expect(ps).toContain("delete bridge.vbs from the Startup folder (Win+R → shell:startup) and the folder %LOCALAPPDATA%\\XauBot");
  expect(ps).toContain("Startup хавтаснаас (Win+R → shell:startup) bridge.vbs-ийг");
  // the .bat waits for no key unless something went wrong
  const full = installerBat(input), bat = full.slice(0, full.indexOf(`\r\n${PS_MARKER}\r\n`));
  expect(bat).toContain("timeout /t 60");
  expect(bat).toMatch(/:failed\r\npause/);
});

test("the script installs the bridge helper: bridge.ps1 and bridge.vbs in %LOCALAPPDATA%\\XauBot, the .vbs in Startup, and starts it", () => {
  const ps = installerScript(input);
  expect(ps).toContain("$BridgePs1 = 'bridge.ps1'");
  expect(ps).toContain("$BridgeVbs = 'bridge.vbs'");
  expect(ps).toContain("Join-Path $env:LOCALAPPDATA 'XauBot'");
  expect(ps).toContain("[Environment]::GetFolderPath('Startup')");
  expect(ps).toContain("Copy-Item -LiteralPath $vbs -Destination $auto -Force");
  expect(ps).toContain("Start-Process -FilePath 'wscript.exe'");
  expect(ps).toContain(`$BridgeMutex = '${BRIDGE_MUTEX}'`);
  // the helper's whole source rides along, line by line
  for (const l of bridgeScript(input.origin).split("\r\n").filter(Boolean)) expect(ps).toContain(psStr(l));
  for (const l of bridgeVbsLines()) expect(ps).toContain(psStr(l));
  // a dry run never installs into the real folders
  expect(ps).toContain("$InstallHelper = (-not $DryRun) -or ($HelperRoot -and $StartupDir)");
});

test("bridge.ps1 is ASCII, posts only to this site with the token header, TLS 1.2, a 10 s timeout and one instance", () => {
  const b = bridgeScript(input.origin);
  expect(b).toMatch(/^[\x00-\x7f]*$/);
  expect(b).not.toMatch(/(?<!\r)\n/);
  expect(b).toContain("$SiteOrigin = 'https://xau.example.mn'");
  expect(b).toContain("$url.StartsWith($SiteOrigin + '/'");
  expect(b).toContain("$req.Headers.Add('x-bot-token', $Token)");
  expect(b).toContain("$req.ContentType = 'application/json'");
  expect(b).toContain("$req.Timeout = 10000");
  expect(b).toContain("[Net.SecurityProtocolType]::Tls12");
  expect(b).toContain("New-Object System.Threading.Mutex($true, $MutexName, [ref]$created)");
  expect(b).toContain("Start-Sleep -Milliseconds 500");
  expect(b).toContain("Move-Item -LiteralPath $tmp -Destination $dst -Force");
  expect(b).not.toContain(input.token);
  expect(() => bridgeScript("https://x.mn'; Remove-Item")).toThrow();
  expect(bridgeVbsLines().join("\n")).toContain('powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""__BRIDGE_PS1__""", 0, False');
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

test.skipIf(process.platform !== "win32")("Windows PowerShell parses the generated installer and bridge scripts without errors", () => {
  const dir = mkdtempSync(join(tmpdir(), "xaubot-ps-"));
  try {
    for (const [name, text] of [["setup.ps1", installerScript(input)], ["bridge.ps1", bridgeScript(input.origin)]] as const) {
      const file = join(dir, name);
      writeFileSync(file, "﻿" + text, "utf8");
      const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
        `$e = $null; $t = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${file.replaceAll("'", "''")}', [ref]$t, [ref]$e); $e.Count`], { encoding: "utf8" });
      expect(`${name}: ${out.trim()}`).toBe(`${name}: 0`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30_000);

/* ---- Dry runs of the real script against fake data folders (Windows PowerShell only). Never a real MT5 folder:
 * -DataRoot points into a fresh temp tree (under XAUBOT_FAKE_ROOT, else the OS temp folder), and -DryRun skips the
 * download, the MT5 start and the clipboard. ---- */

type FakeServer = { name: string; history?: string[]; ticks?: string[]; age: number }; // age: minutes since last touched
type FakeTerminal = { commonIni?: string; servers: FakeServer[] };

const utf16 = (text: string) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text.replace(/\r?\n/g, "\r\n"), "utf16le")]);

type Helper = { ps1: Buffer; vbs: Buffer; startup: Buffer };
function dryRun(fake: FakeTerminal, withHelper = false): { out: string; ini: string; helper?: Helper; helperRoot: string } {
  const root = mkdtempSync(join(process.env.XAUBOT_FAKE_ROOT ?? tmpdir(), "xaubot-dry-"));
  try {
    const install = join(root, "Programs", "Broker MT5");
    const data = join(root, "Terminal", "0123ABCD");
    mkdirSync(install, { recursive: true });
    writeFileSync(join(install, "terminal64.exe"), "");
    mkdirSync(join(data, "MQL5", "Experts"), { recursive: true });
    mkdirSync(join(data, "config"), { recursive: true });
    writeFileSync(join(data, "origin.txt"), utf16(install));
    if (fake.commonIni !== undefined) writeFileSync(join(data, "config", "common.ini"), utf16(fake.commonIni));
    const now = Date.now() / 1000;
    for (const srv of fake.servers) {
      const dir = join(data, "bases", srv.name);
      mkdirSync(dir, { recursive: true });
      const touched: string[] = [];
      for (const [sub, names] of [["history", srv.history ?? []], ["ticks", srv.ticks ?? []]] as const) {
        for (const n of names) { mkdirSync(join(dir, sub, n), { recursive: true }); touched.push(join(dir, sub, n)); }
        if (names.length) touched.push(join(dir, sub));
      }
      const t = now - srv.age * 60;
      for (const p of [...touched, dir]) utimesSync(p, t, t); // children first: making one touches its parent
    }
    const script = join(root, "setup.ps1");
    writeFileSync(script, "﻿" + installerScript(input), "utf8");
    const helperRoot = join(root, "LocalAppData", "XauBot"), startupDir = join(root, "Startup");
    let out: string;
    try {
      out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script,
        "-DataRoot", join(root, "Terminal"), ...(withHelper ? ["-HelperRoot", helperRoot, "-StartupDir", startupDir] : []), "-DryRun"], { encoding: "utf8" });
    } catch (e) { throw new Error(`dry run failed: ${(e as { stdout?: string }).stdout ?? String(e)}`); }
    const raw = readFileSync(join(data, "config", "xaubot-start.ini"));
    expect([raw[0], raw[1]]).toEqual([0xff, 0xfe]); // UTF-16LE with a BOM, as MT5 writes it
    const preset = readFileSync(join(data, "MQL5", "Presets", "XauBot.set"));
    expect(preset.subarray(2).toString("utf16le")).toBe(presetText(input.syncUrl, input.token));
    const helper = withHelper
      ? { ps1: readFileSync(join(helperRoot, "bridge.ps1")), vbs: readFileSync(join(helperRoot, "bridge.vbs")), startup: readFileSync(join(startupDir, "bridge.vbs")) }
      : undefined;
    if (!withHelper) expect(existsSync(helperRoot) || existsSync(startupDir)).toBe(false);
    return { out, ini: raw.subarray(2).toString("utf16le"), helper, helperRoot };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const onWindows = test.skipIf(process.platform !== "win32");

onWindows("dry run: the login server's GOLD wins over other brokers' XAUUSD; the account number is not printed", () => {
  const { out, ini } = dryRun({
    commonIni: "[Common]\nLogin=31415926\nServer=XMGlobal-MT5 15\nProxyEnable=0\n[Charts]\nServer=Wrong-Server\n",
    servers: [
      { name: "XMGlobal-MT5 15", history: ["EURUSD", "GOLD", "GOLDEUR", "XAUEUR"], age: 600 },
      { name: "JustMarkets-Demo2", history: ["XAUUSD.m"], age: 5 },
      { name: "Other-Live", history: ["XAUUSD"], ticks: ["XAUUSD"], age: 1 },
    ],
  });
  expect(ini).toContain("\r\nExpert=XauBot\r\n");
  expect(ini).toContain("\r\nSymbol=GOLD\r\n");
  expect(out).toMatch(/server: XMGlobal-MT5 15 {3}symbol: GOLD\b/);
  expect(out).toContain("If the chart shows no robot:");
  expect(out).not.toContain("31415926");
  expect(out).not.toContain("Wrong-Server");
  expect(out).toContain("(dry run: the helper was not installed)");
}, 60_000);

onWindows("dry run with helper folders: bridge.ps1 (UTF-8 BOM), bridge.vbs (UTF-16) pointing at it, and its copy in Startup", () => {
  const { out, helper, helperRoot } = dryRun({ commonIni: "[Common]\nLogin=1\nServer=JustMarkets-Demo2\n", servers: [{ name: "JustMarkets-Demo2", history: ["XAUUSD.m"], age: 5 }] }, true);
  const h = helper!;
  expect([...h.ps1.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(h.ps1.subarray(3).toString("utf8")).toBe(bridgeScript(input.origin));
  expect([h.vbs[0], h.vbs[1]]).toEqual([0xff, 0xfe]);
  const vbs = h.vbs.subarray(2).toString("utf16le");
  expect(vbs).toContain(`-File ""${join(helperRoot, "bridge.ps1")}"""`);
  expect(vbs).not.toContain("__BRIDGE_PS1__");
  expect(h.startup.equals(h.vbs)).toBe(true);
  expect(out).toContain("The helper that links the robot to the site was installed:");
  expect(out).toContain("The helper starts hidden every time Windows starts (Startup):");
  expect(out).toContain("As soon as the robot connects, the site's Bot page shows 'Connected ✓'");
  expect(out).toContain("To remove the helper:");
}, 60_000);

onWindows("dry run: XAUUSD.m on the login server, although another server has plain XAUUSD", () => {
  const { out, ini } = dryRun({
    commonIni: "[Common]\nLogin=1\nServer=JustMarkets-Demo2\n",
    servers: [
      { name: "JustMarkets-Demo2", history: ["EURUSD", "XAUUSD.m"], ticks: ["GOLD"], age: 120 },
      { name: "XMGlobal-MT5 15", history: ["XAUUSD"], age: 1 },
    ],
  });
  expect(ini).toContain("\r\nSymbol=XAUUSD.m\r\n");
  expect(out).toMatch(/server: JustMarkets-Demo2 {3}symbol: XAUUSD\.m/);
}, 60_000);

onWindows("dry run: with no Server in common.ini the newest server that has gold is used whole, never mixed", () => {
  const { out, ini } = dryRun({
    commonIni: "[Common]\nProxyEnable=0\n",
    servers: [
      { name: "Newest-NoGold", history: ["EURUSD"], age: 1 },
      { name: "Middle-Broker", history: ["GOLD", "XAUUSDm"], age: 30 },
      { name: "Old-Broker", history: ["XAUUSD"], age: 3000 },
    ],
  });
  expect(ini).toContain("\r\nSymbol=XAUUSDm\r\n");
  expect(out).toContain("The login server is not in config\\common.ini");
  expect(out).toMatch(/server: Middle-Broker {3}symbol: XAUUSDm/);
}, 60_000);

onWindows("dry run: no gold symbol on the login server, so no StartUp chart and the manual steps are printed", () => {
  const { out, ini } = dryRun({
    commonIni: "[Common]\nLogin=2\nServer=Fx-Only\n",
    servers: [
      { name: "Fx-Only", history: ["EURUSD", "GBPUSD", "XAUEUR"], age: 10 },
      { name: "Elsewhere", history: ["XAUUSD"], age: 1 }, // another broker's gold is never borrowed
    ],
  });
  expect(ini).toBe(["[Experts]", "Enabled=1", "AllowLiveTrading=1", "AllowDllImport=0", ""].join("\r\n"));
  expect(out).toContain("The gold symbol could not be found for sure");
  expect(out).toContain("Drag XauBot from Navigator → Expert Advisors onto that chart.");
  expect(out).toContain("Click Inputs → Load → XauBot.set.");
  expect(out).toMatch(/server: Fx-Only {3}symbol: -/);
  expect(out).toContain("If the chart shows no robot:");
}, 60_000);

/* ---- The bridge itself, run once (-Once) against a temp Common folder and a tiny local server (Windows only). ---- */

const run = promisify(execFile);
type Seen = { token: string | undefined; type: string | undefined; body: string; path: string };

async function withServer(reply: (body: string) => { status: number; body: string }, fn: (origin: string, seen: Seen[]) => Promise<void>) {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      seen.push({ token: req.headers["x-bot-token"] as string | undefined, type: req.headers["content-type"], body, path: req.url ?? "" });
      const r = reply(body);
      res.writeHead(r.status, { "content-type": "application/json; charset=utf-8" });
      res.end(r.body);
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  try { await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen); } finally { await new Promise((ok) => server.close(ok)); }
}

/** Writes each login's request.json (an object, or raw text) under a temp Common folder and runs bridge.ps1 -Once. */
async function bridgeOnce(origin: string, requests: Record<string, object | string>) {
  const dir = mkdtempSync(join(process.env.XAUBOT_FAKE_ROOT ?? tmpdir(), "xaubot-bridge-"));
  const common = join(dir, "Common");
  const folder = (login: string) => join(common, "Files", "xaubot", login);
  for (const [login, req] of Object.entries(requests)) {
    mkdirSync(folder(login), { recursive: true });
    writeFileSync(join(folder(login), "request.json"), typeof req === "string" ? req : JSON.stringify(req), "utf8");
  }
  const script = join(dir, "bridge.ps1");
  writeFileSync(script, "﻿" + bridgeScript(origin), "utf8");
  await run("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Once", "-CommonRoot", common], { timeout: 60_000 });
  const responses: Record<string, unknown> = {};
  const raw: Record<string, Buffer> = {};
  for (const login of Object.keys(requests)) {
    const f = join(folder(login), "response.json");
    if (existsSync(f)) { raw[login] = readFileSync(f); responses[login] = JSON.parse(raw[login].toString("utf8")); }
    expect(existsSync(join(folder(login), "response.tmp"))).toBe(false);
  }
  const logFile = join(dir, "bridge.log");
  const log = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
  rmSync(dir, { recursive: true, force: true });
  return { responses, raw, log };
}

const unixNow = () => Math.floor(Date.now() / 1000);

onWindows("bridge -Once: posts the robot's body with its token and writes the site's answer back under the same seq", async () => {
  const answer = JSON.stringify({ state: "RUNNING", runId: "r-1", lots: 0.01, lang: "mn", reason: "Холбогдлоо \"ok\"\nline\\x", orders: "1,2;3" });
  await withServer(() => ({ status: 200, body: answer }), async (origin, seen) => {
    const body = JSON.stringify({ account: { login: "51234567", mode: "DEMO", balance: 1000, equity: 1000 }, symbol: "XAUUSD", reason: "Ази \"x\"" });
    const { responses, raw, log } = await bridgeOnce(origin, { "51234567": { url: `${origin}/api/bot/sync`, token: input.token, seq: 1795000000001, at: unixNow(), body } });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ token: input.token, type: "application/json", path: "/api/bot/sync", body });
    expect(responses["51234567"]).toEqual({ seq: 1795000000001, status: 200, body: answer });
    expect(raw["51234567"].toString("latin1")).toMatch(/^[\x20-\x7e]*$/); // ASCII only: other letters as \uXXXX, which the robot decodes
    expect(log).toContain("...4567: status 200");
    expect(log).not.toContain(input.token);
    expect(log).not.toContain("51234567");
  });
}, 90_000);

onWindows("bridge -Once: the site's error comes back as is; another site's address gets status 0; stale or half-written requests are not sent", async () => {
  await withServer(() => ({ status: 401, body: "{\"error\":\"unauthorized\"}" }), async (origin, seen) => {
    const { responses, log } = await bridgeOnce(origin, {
      "1001": { url: `${origin}/api/bot/sync`, token: input.token, seq: 7, at: unixNow(), body: "{}" },
      "1002": { url: "http://127.0.0.2:9/api/bot/sync", token: input.token, seq: 8, at: unixNow(), body: "{}" },
      "1003": { url: `${origin}/api/bot/sync`, token: input.token, seq: 9, at: unixNow() - 3600, body: "{}" },
      "1004": `{"url":"${origin}/api/bot/sync","token":"${input.token}","seq":10,"at":${unixNow()},"bo`,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].token).toBe(input.token);
    expect(responses["1001"]).toEqual({ seq: 7, status: 401, body: "{\"error\":\"unauthorized\"}" });
    expect(responses["1002"]).toEqual({ seq: 8, status: 0, body: "" });
    expect(responses["1003"]).toBeUndefined();
    expect(responses["1004"]).toBeUndefined();
    expect(log).not.toContain(input.token);
  });
}, 90_000);

onWindows("bridge -Once: a site that cannot be reached gives status 0", async () => {
  let origin = "";
  await withServer(() => ({ status: 200, body: "{}" }), async (o) => { origin = o; }); // a port nothing listens on any more
  const { responses } = await bridgeOnce(origin, { "2001": { url: `${origin}/api/bot/sync`, token: input.token, seq: 3, at: unixNow(), body: "{}" } });
  expect(responses["2001"]).toEqual({ seq: 3, status: 0, body: "" });
}, 90_000);
