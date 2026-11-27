/*
 * The one-click Windows installer for the MT5 robot: a .bat file that unpacks the PowerShell script after its
 * marker line to %TEMP% and runs it. The script finds the member's MT5 terminals, puts XauBot.ex5 into the chosen
 * one, writes the robot's inputs (sync address and token) as a preset, and starts MT5 with a startup config that
 * opens a gold chart with the robot on it.
 *
 * What it cannot do: allow the site's address for WebRequest. MT5 keeps that list encrypted in common.ini, and a
 * startup config's [Experts] WebRequest / WebRequestUrl are not saved (tried on a test terminal, build 6230: common.ini
 * stayed byte for byte the same). The script copies the address to the clipboard and says where to paste it.
 *
 * Everything here is pure: the route passes the origin, sync address and token in.
 */

export const INSTALLER_FILENAME = "XauBot-Setup.bat";
/** The line in the .bat after which the PowerShell script starts. */
export const PS_MARKER = "#XAUBOT-PS1";
export const EXPERT_NAME = "XauBot";
export const PRESET_FILE = "XauBot.set";
export const STARTUP_INI = "xaubot-start.ini";
/** Stands for the gold symbol in the startup config until the script has found the terminal's own name for it. */
export const GOLD_PLACEHOLDER = "__GOLD__";

export type InstallerInput = { origin: string; syncUrl: string; token: string };

const CRLF = "\r\n";
export const toCrlf = (s: string) => s.replace(/\r?\n/g, CRLF);

/** A PowerShell single-quoted literal: nothing inside is expanded, a quote is written twice. */
export function psStr(s: string): string {
  if ([...s].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) throw new Error("installer: a value may not hold control characters");
  return `'${s.replaceAll("'", "''")}'`;
}

function checked({ origin, syncUrl, token }: InstallerInput): InstallerInput {
  const o = origin.replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/'"]+$/.test(o)) throw new Error("installer: the origin must be a bare http(s) address");
  if (!/^https?:\/\/\S+$/.test(syncUrl)) throw new Error("installer: the sync address must be an http(s) address");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) throw new Error("installer: unexpected token format");
  return { origin: o, syncUrl, token };
}

/** MQL5\Presets\XauBot.set: the two inputs the installer sets. Every other input keeps the robot's default. */
export function presetLines(syncUrl: string, token: string): string[] {
  return [`ServerUrl=${syncUrl}`, `BotToken=${token}`];
}
export const presetText = (syncUrl: string, token: string) => presetLines(syncUrl, token).join(CRLF) + CRLF;

/** The startup config MT5 is launched with (terminal64.exe /config:"…"). */
export function startupIniLines(symbol: string): string[] {
  return [
    "[Experts]",
    "Enabled=1",
    "AllowLiveTrading=1",
    "AllowDllImport=0",
    "[StartUp]",
    `Expert=${EXPERT_NAME}`,
    `ExpertParameters=${PRESET_FILE}`,
    `Symbol=${symbol}`,
    "Period=M15",
  ];
}
export const startupIniText = (symbol: string) => startupIniLines(symbol).join(CRLF) + CRLF;

/* ---- Console messages: Mongolian first, the English under it. Trading terms stay in English. ---- */

type MsgKey =
  | "title" | "notFound" | "notFoundHint" | "several" | "chooseAgain" | "chosen" | "running" | "downloading" | "downloaded"
  | "badToken" | "downloadFailed" | "preset" | "symbol" | "starting" | "dryRun" | "clipboard" | "clipboardFailed" | "paste"
  | "login" | "algo" | "oldChart" | "afterPaste" | "done" | "failed";

function installerTextMn(): Record<MsgKey, string> {
  return {
    title: "=== XauBot суулгагч ===",
    notFound: "Энэ компьютер дээр MT5 олдсонгүй.",
    notFoundHint: "MT5-аа суулгаад нэг удаа нээж хаасны дараа энэ файлыг дахин ажиллуулна уу.",
    several: "Хэд хэдэн MT5 байна. Robot-ыг аль MT5-д суулгахыг дугаараар нь сонгоод Enter дарна уу:",
    chooseAgain: "Жагсаалтад байгаа дугаарыг бичнэ үү.",
    chosen: "Сонгосон MT5:",
    running: "Энэ MT5 нээлттэй байна. MT5-аа хаагаад (File → Exit) Enter дарна уу.",
    downloading: "XauBot.ex5 robot-ыг site-аас татаж байна…",
    downloaded: "Robot-ыг MT5-д хууллаа:",
    badToken: "Token хүчингүй байна. Site-ын Bot хуудаснаас installer-ийг дахин татна уу.",
    downloadFailed: "Robot-ын файлыг татаж чадсангүй. Интернэт холболтоо шалгаад дахин оролдоно уу.",
    preset: "Robot-ын тохиргоо (ServerUrl, BotToken) бичигдлээ:",
    symbol: "Алтны symbol:",
    starting: "MT5-ыг XauBot-той нь нээж байна…",
    dryRun: "(туршилт: татах, MT5 нээх, clipboard алгаслаа)",
    clipboard: "Site-ын хаягийг clipboard-д хууллаа:",
    clipboardFailed: "Clipboard-д хуулж чадсангүй. Энэ хаягийг гараар бичнэ үү:",
    paste: "Сүүлийн алхам: MT5 дээр Tools → Options → Expert Advisors цонхыг нээж, «Allow WebRequest for listed URL»-ийг чагтлаад, жагсаалтын «add new URL» мөрөн дээр дарж Ctrl+V дараад OK дарна.",
    login: "MT5 таны арилжааны дансаар нэвтэрсэн байх ёстой (File → Login to Trade Account).",
    algo: "Дээд самбарын «Algo Trading» товч ногоон байх ёстой.",
    oldChart: "Өмнө нь өөр чарт дээр XauBot байсан бол тэр чартыг хаана уу: хуучин token ажиллахаа больсон.",
    afterPaste: "Хаягийг нэмж OK дарсны дараа Enter дарна уу.",
    done: "Бэлэн боллоо — сайтын Bot хуудсан дээр 'Холбогдлоо ✓' гарна",
    failed: "Алдаа гарлаа:",
  };
}

function installerTextEn(): Record<MsgKey, string> {
  return {
    title: "=== XauBot installer ===",
    notFound: "No MT5 was found on this computer.",
    notFoundHint: "Install MT5, open and close it once, then run this file again.",
    several: "Several MT5 terminals were found. Type the number of the one to install the robot in and press Enter:",
    chooseAgain: "Type one of the numbers in the list.",
    chosen: "Chosen MT5:",
    running: "This MT5 is open. Close it (File → Exit), then press Enter.",
    downloading: "Downloading the XauBot.ex5 robot from the site…",
    downloaded: "The robot was copied into MT5:",
    badToken: "The token is no longer valid. Download the installer again from the site's Bot page.",
    downloadFailed: "Could not download the robot file. Check the internet connection and try again.",
    preset: "The robot's settings (ServerUrl, BotToken) were written:",
    symbol: "Gold symbol:",
    starting: "Opening MT5 with XauBot…",
    dryRun: "(dry run: download, MT5 start and clipboard skipped)",
    clipboard: "The site's address was copied to the clipboard:",
    clipboardFailed: "Could not copy to the clipboard. Type this address by hand:",
    paste: "Last step: in MT5 open Tools → Options → Expert Advisors, tick \"Allow WebRequest for listed URL\", click the \"add new URL\" row, press Ctrl+V and then OK.",
    login: "MT5 must be signed in to your trading account (File → Login to Trade Account).",
    algo: "The \"Algo Trading\" button in the top toolbar must be green.",
    oldChart: "If XauBot was already on another chart, close that chart: the old token no longer works.",
    afterPaste: "After adding the address and pressing OK, press Enter.",
    done: "All set — the site's Bot page will show 'Connected ✓'",
    failed: "Something went wrong:",
  };
}

/** The PowerShell script, as lines. Params: -DataRoot (where the terminals' data folders are), -Choice n, -DryRun. */
export function installerScriptLines(input: InstallerInput): string[] {
  const { origin, syncUrl, token } = checked(input);
  const mn = installerTextMn(), en = installerTextEn();
  const say = (k: MsgKey, color = "White") => `Say ${psStr(mn[k])} ${psStr(en[k])} '${color}'`;
  const arr = (xs: string[]) => `@(${xs.map(psStr).join(", ")})`;
  return [
    "# XauBot installer for MetaTrader 5. Made for one member: it holds their robot token. Do not share this file.",
    "param(",
    "  [string]$DataRoot = (Join-Path $env:APPDATA 'MetaQuotes\\Terminal'),",
    "  [int]$Choice = 0,",
    "  [switch]$DryRun",
    ")",
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    "try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}",
    "try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}",
    "",
    `$SiteOrigin = ${psStr(origin)}`,
    `$BotToken = ${psStr(token)}`,
    `$ExpertFile = ${psStr(`${EXPERT_NAME}.ex5`)}`,
    `$PresetFile = ${psStr(PRESET_FILE)}`,
    `$StartupIni = ${psStr(STARTUP_INI)}`,
    `$PresetLines = ${arr(presetLines(syncUrl, token))}`,
    `$IniLines = ${arr(startupIniLines(GOLD_PLACEHOLDER))}`,
    `$GoldPlaceholder = ${psStr(GOLD_PLACEHOLDER)}`,
    "$Utf16 = New-Object System.Text.UnicodeEncoding($false, $true)",
    "",
    "function Say([string]$Mn, [string]$En, [string]$Color = 'White') {",
    "  Write-Host $Mn -ForegroundColor $Color",
    "  if ($En) { Write-Host ('  ' + $En) -ForegroundColor DarkGray }",
    "}",
    "function Wait-Enter {",
    "  if (-not $DryRun) { [void](Read-Host '  Enter') }",
    "}",
    "# UTF-16LE with a BOM and CRLF line ends: how MT5 writes its own .set and .ini files.",
    "function Write-Utf16([string]$Path, [string[]]$Lines) {",
    "  $dir = Split-Path -Parent $Path",
    "  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }",
    "  [System.IO.File]::WriteAllText($Path, (($Lines -join \"`r`n\") + \"`r`n\"), $Utf16)",
    "}",
    "",
    "# Each data folder under $DataRoot names its install folder in origin.txt (UTF-16LE). A portable install keeps",
    "# its data (MQL5, config, bases) in the install folder itself and is started with /portable.",
    "function Find-Terminals([string]$Root) {",
    "  if (-not (Test-Path -LiteralPath $Root)) { return }",
    "  foreach ($d in @(Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue)) {",
    "    $origin = Join-Path $d.FullName 'origin.txt'",
    "    if (-not (Test-Path -LiteralPath $origin)) { continue }",
    "    try { $install = [System.IO.File]::ReadAllText($origin, [System.Text.Encoding]::Unicode) } catch { continue }",
    "    $install = $install.Trim().TrimStart([char]0xFEFF).Trim().TrimEnd('\\')",
    "    if (-not $install) { continue }",
    "    $exe = Join-Path $install 'terminal64.exe'",
    "    if (-not (Test-Path -LiteralPath $exe)) { continue }",
    "    $data = $d.FullName",
    "    $portable = $false",
    "    if (-not (Test-Path -LiteralPath (Join-Path $data 'MQL5')) -and (Test-Path -LiteralPath (Join-Path $install 'MQL5'))) { $data = $install; $portable = $true }",
    "    [pscustomobject]@{ Name = (Split-Path -Leaf $install); Install = $install; Exe = $exe; Data = $data; Portable = $portable }",
    "  }",
    "}",
    "",
    "# The broker's name for gold, from the symbols this terminal already has history or ticks for:",
    "# XAUUSD itself first, then XAUUSD with a suffix (XAUUSD.m, XAUUSDm), then GOLD, newest folder first. Else XAUUSD.",
    "function Find-GoldSymbol([string]$Data) {",
    "  $found = @()",
    "  $bases = Join-Path $Data 'bases'",
    "  if (Test-Path -LiteralPath $bases) {",
    "    foreach ($server in @(Get-ChildItem -LiteralPath $bases -Directory -ErrorAction SilentlyContinue)) {",
    "      foreach ($sub in @('history', 'ticks')) {",
    "        $dir = Join-Path $server.FullName $sub",
    "        if (-not (Test-Path -LiteralPath $dir)) { continue }",
    "        foreach ($s in @(Get-ChildItem -LiteralPath $dir -Directory -ErrorAction SilentlyContinue)) {",
    "          if ($s.Name -match '^(XAUUSD|GOLD)') { $found += [pscustomobject]@{ Name = $s.Name; Time = $s.LastWriteTime } }",
    "        }",
    "      }",
    "    }",
    "  }",
    "  if ($found.Count -eq 0) { return 'XAUUSD' }",
    "  $rank = { param($n) if ($n -ieq 'XAUUSD') { 0 } elseif ($n -match '^XAUUSD') { 1 } elseif ($n -ieq 'GOLD') { 2 } else { 3 } }",
    "  $best = $found | Sort-Object @{ Expression = { & $rank $_.Name } }, @{ Expression = { $_.Time }; Descending = $true } | Select-Object -First 1",
    "  return [string]$best.Name",
    "}",
    "",
    "function Test-Running([string]$Exe) {",
    "  $open = @(Get-Process -Name terminal64 -ErrorAction SilentlyContinue | Where-Object { try { $_.Path -ieq $Exe } catch { $false } })",
    "  return $open.Count -gt 0",
    "}",
    "",
    "try {",
    `  ${say("title", "Cyan")}`,
    "  Write-Host ''",
    "  # a. Which MT5",
    "  $terms = @(Find-Terminals $DataRoot)",
    "  if ($terms.Count -eq 0) {",
    `    ${say("notFound", "Red")}`,
    `    ${say("notFoundHint")}`,
    "    exit 1",
    "  }",
    "  if ($terms.Count -eq 1) { $term = $terms[0] }",
    "  else {",
    `    ${say("several", "Yellow")}`,
    "    for ($i = 0; $i -lt $terms.Count; $i++) { Write-Host ('  {0}) {1}   ({2})' -f ($i + 1), $terms[$i].Name, $terms[$i].Install) }",
    "    $n = $Choice",
    "    while ($n -lt 1 -or $n -gt $terms.Count) {",
    "      if ($DryRun) { $n = 1; break }",
    "      $answer = Read-Host '  #'",
    "      if (-not [int]::TryParse($answer, [ref]$n) -or $n -lt 1 -or $n -gt $terms.Count) {",
    `        ${say("chooseAgain", "Yellow")}`,
    "        $n = 0",
    "      }",
    "    }",
    "    $term = $terms[$n - 1]",
    "  }",
    `  ${say("chosen", "Green")}`,
    "  Write-Host ('  ' + $term.Name + '   (' + $term.Install + ')')",
    "  Write-Host ('  data: ' + $term.Data)",
    "",
    "  # b. MT5 must be closed: the robot file and the startup config are read when it starts. Never closed for the member.",
    "  while (Test-Running $term.Exe) {",
    `    ${say("running", "Yellow")}`,
    "    if ($DryRun) { break }",
    "    Wait-Enter",
    "  }",
    "",
    "  # c. The current robot file, fetched with the token (no browser session here).",
    "  $experts = Join-Path $term.Data 'MQL5\\Experts'",
    "  $ex5 = Join-Path $experts $ExpertFile",
    "  if ($DryRun) {",
    `    ${say("dryRun", "DarkYellow")}`,
    "  } else {",
    `    ${say("downloading")}`,
    "    if (-not (Test-Path -LiteralPath $experts)) { New-Item -ItemType Directory -Force -Path $experts | Out-Null }",
    "    $tmp = Join-Path $env:TEMP ('XauBot-' + [guid]::NewGuid().ToString('N') + '.ex5')",
    "    try {",
    "      Invoke-WebRequest -Uri ($SiteOrigin + '/api/bot/download?file=ex5') -Headers @{ 'x-bot-token' = $BotToken } -OutFile $tmp -UseBasicParsing",
    "    } catch {",
    "      $code = 0",
    "      try { $code = [int]$_.Exception.Response.StatusCode } catch {}",
    `      if ($code -eq 401) { ${say("badToken", "Red")} } else { ${say("downloadFailed", "Red")} }`,
    "      Write-Host ('  ' + $_.Exception.Message) -ForegroundColor DarkGray",
    "      exit 1",
    "    }",
    "    if ((Get-Item -LiteralPath $tmp).Length -lt 1000) {",
    "      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue",
    `      ${say("downloadFailed", "Red")}`,
    "      exit 1",
    "    }",
    "    Move-Item -LiteralPath $tmp -Destination $ex5 -Force",
    `    ${say("downloaded", "Green")}`,
    "    Write-Host ('  ' + $ex5)",
    "  }",
    "",
    "  # d. The robot's inputs.",
    "  $preset = Join-Path $term.Data ('MQL5\\Presets\\' + $PresetFile)",
    "  Write-Utf16 $preset $PresetLines",
    `  ${say("preset", "Green")}`,
    "  Write-Host ('  ' + $preset)",
    "",
    "  # e. The broker's gold symbol.",
    "  $gold = Find-GoldSymbol $term.Data",
    `  ${say("symbol", "Green")}`,
    "  Write-Host ('  ' + $gold)",
    "",
    "  # f. Start MT5 with a gold M15 chart and the robot on it.",
    "  $ini = Join-Path $term.Data ('config\\' + $StartupIni)",
    "  Write-Utf16 $ini @($IniLines | ForEach-Object { $_.Replace($GoldPlaceholder, $gold) })",
    "  $arguments = '/config:\"' + $ini + '\"'",
    "  if ($term.Portable) { $arguments = '/portable ' + $arguments }",
    "  if (-not $DryRun) {",
    `    ${say("starting")}`,
    "    Start-Process -FilePath $term.Exe -ArgumentList $arguments -WorkingDirectory $term.Install | Out-Null",
    "  } else { Write-Host ('  ' + $term.Exe + ' ' + $arguments) -ForegroundColor DarkGray }",
    "  Write-Host ''",
    "",
    "  # g. WebRequest: MT5 keeps the allowed addresses encrypted and does not save them from a startup config.",
    "  $copied = $false",
    "  if (-not $DryRun) { try { Set-Clipboard -Value $SiteOrigin; $copied = $true } catch {} }",
    `  if ($copied) { ${say("clipboard", "Green")} } else { ${say("clipboardFailed", "Yellow")} }`,
    "  Write-Host ('  ' + $SiteOrigin) -ForegroundColor Cyan",
    `  ${say("paste", "Yellow")}`,
    `  ${say("login")}`,
    `  ${say("algo")}`,
    `  ${say("oldChart")}`,
    `  ${say("afterPaste", "Yellow")}`,
    "  Wait-Enter",
    "",
    "  # h.",
    "  Write-Host ''",
    `  ${say("done", "Green")}`,
    "  exit 0",
    "} catch {",
    `  ${say("failed", "Red")}`,
    "  Write-Host ('  ' + $_.Exception.Message) -ForegroundColor DarkGray",
    "  exit 1",
    "}",
  ];
}
export const installerScript = (input: InstallerInput) => installerScriptLines(input).join(CRLF) + CRLF;

/**
 * The downloadable .bat: a short cmd part (ASCII only, no BOM, so cmd reads "@echo off" as the first line) that copies
 * every line after PS_MARKER into a .ps1 in %TEMP% (UTF-8 with BOM, which Windows PowerShell 5.1 needs for Cyrillic)
 * and runs it. Arguments given to the .bat are passed on to the script. CRLF throughout.
 */
export function installerBat(input: InstallerInput): string {
  const cmd = [
    "@echo off",
    "rem XauBot installer for MetaTrader 5. It holds your personal robot token: do not share this file.",
    "setlocal",
    "title XauBot Setup",
    "set \"XB_SELF=%~f0\"",
    "set \"XB_PS1=%TEMP%\\XauBot-Setup-%RANDOM%%RANDOM%.ps1\"",
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$l = [IO.File]::ReadAllLines($env:XB_SELF, [Text.Encoding]::UTF8); $i = [Array]::IndexOf($l, '${PS_MARKER}'); if ($i -lt 0) { exit 2 }; [IO.File]::WriteAllLines($env:XB_PS1, $l[($i + 1)..($l.Length - 1)], (New-Object Text.UTF8Encoding($true)))"`,
    "if errorlevel 1 goto unpackfailed",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%XB_PS1%\" %*",
    "set \"XB_RC=%errorlevel%\"",
    "del \"%XB_PS1%\" >nul 2>&1",
    "echo.",
    "pause",
    "exit /b %XB_RC%",
    ":unpackfailed",
    "echo XauBot: the installer could not be unpacked.",
    "pause",
    "exit /b 1",
    PS_MARKER,
  ];
  return cmd.join(CRLF) + CRLF + installerScript(input);
}
