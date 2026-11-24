import { parseGate, parseConfig, commandFor, blackoutWindows, reportSchema, minRobotVersion, DEFAULT_GATE, DEFAULT_LIVE_CONFIG, GATE_ROBOT_VERSION, type LiveConfig } from "@/lib/bot/live";
import { enT } from "@/lib/i18n";

/** The gate form as the bot page posts it: numbers as strings, a ticked checkbox as "on", an unticked one absent. */
const form = (o: Record<string, string | undefined> = {}) => ({
  gOn: "on", gTrend: "on", gStart: "15", gEnd: "1", gNewsBefore: "30", gNewsAfter: "60", gAtrMin: "1.5", gAtrMax: "25",
  gSpreadPct: "10", gRsiMax: "70", gExtAtr: "2", gMaxTrades: "6", gDailyLoss: "3", ...o,
});
const running = (config: LiveConfig) => ({ state: "RUNNING" as const, runId: "r", closeAll: false, config });

describe("the entry filter's settings", () => {
  test("it is on by default, with conservative values", () => {
    expect(DEFAULT_LIVE_CONFIG.gate).toEqual(DEFAULT_GATE);
    expect(DEFAULT_GATE).toMatchObject({ on: true, trend: true, sessionStartUb: 15, sessionEndUb: 1, newsBeforeMin: 30, newsAfterMin: 60, maxTradesDay: 6, dailyLossPct: 3 });
  });
  test("the page's form is read into the gate, and saving it keeps every tool's settings", () => {
    const basket = parseConfig({ mode: "BASKET", bLots: "0.02", bCount: "10", bProfit: "5", bLoss: "12" }).config!;
    const r = parseGate(form({ gStart: "16", gEnd: "0", gRsiMax: "65", gMaxTrades: "3" }), basket);
    expect(r.error).toBeUndefined();
    expect(r.config).toMatchObject({ mode: "BASKET", basket: { count: 10 }, gate: { on: true, sessionStartUb: 16, sessionEndUb: 0, rsiMax: 65, maxTradesDay: 3 } });
  });
  test("saving a tool keeps the gate", () => {
    const gated = parseGate(form({ gMaxTrades: "2" })).config!;
    expect(parseConfig({ lots: "0.1", maxPositions: "1", slAtr: "1", tpAtr: "1" }, gated).config!.gate.maxTradesDay).toBe(2);
    expect(parseConfig({ mode: "ASIAN", rLots: "0.02" }, gated).config!.gate.maxTradesDay).toBe(2);
  });
  test("an unticked box switches its check off, and a blank number means 0 (that check off)", () => {
    const r = parseGate(form({ gOn: undefined, gTrend: undefined, gNewsBefore: "", gAtrMin: "", gDailyLoss: "" }));
    expect(r.config!.gate).toMatchObject({ on: false, trend: false, newsBeforeMin: 0, atrMin: 0, dailyLossPct: 0 });
  });
  test("values the robot could not act on are refused, in the viewer's language", () => {
    for (const bad of [
      { gStart: "24" }, { gEnd: "-1" }, { gStart: "1.5" }, { gNewsBefore: "241" }, { gNewsAfter: "2.5" }, { gAtrMin: "-1" },
      { gAtrMax: "abc" }, { gSpreadPct: "101" }, { gRsiMax: "50" }, { gRsiMax: "96" }, { gExtAtr: "21" }, { gMaxTrades: "2.5" },
      { gMaxTrades: "101" }, { gDailyLoss: "51" }, { gAtrMin: "5", gAtrMax: "5" }, { gAtrMin: "9", gAtrMax: "4" },
    ]) expect(parseGate(form(bad)).error, JSON.stringify(bad)).toBeTruthy();
    expect(parseGate(form({ gAtrMin: "9", gAtrMax: "4" }), DEFAULT_LIVE_CONFIG, enT).error).toBe("The lowest ATR must be below the highest");
    expect(parseGate(form({ gAtrMin: "9", gAtrMax: "0" })).error).toBeUndefined(); // no upper bound
    expect(parseGate(form({ gRsiMax: "0" })).config!.gate.rsiMax).toBe(0);
  });
});

describe("the entry filter in the command", () => {
  test("the robot gets every check as a flat field, with the release windows", () => {
    const cmd = commandFor(running(DEFAULT_LIVE_CONFIG), { mode: "DEMO" }, GATE_ROBOT_VERSION, "mn", "100-200");
    expect(cmd).toMatchObject({ gateOn: true, gTrend: true, gSessionStart: 15, gSessionEnd: 1, gAtrMin: 1.5, gAtrMax: 25, gSpreadPct: 10, gRsiMax: 70, gExtAtr: 2, gMaxTrades: 6, gDailyLossPct: 3, blackouts: "100-200" });
  });
  test("with the filter off every check goes out off, the trading hours become all day and no windows are sent", () => {
    const off = parseGate(form({ gOn: undefined })).config!;
    expect(commandFor(running(off), { mode: "DEMO" }, GATE_ROBOT_VERSION, "mn", "100-200")).toMatchObject({
      gateOn: false, gTrend: false, gSessionStart: 15, gSessionEnd: 15, gAtrMin: 0, gAtrMax: 0, gSpreadPct: 0, gRsiMax: 0, gExtAtr: 0, gMaxTrades: 0, gDailyLossPct: 0, blackouts: "",
    });
  });
  test("a stored config from before the filter existed is sent with the default filter", () => {
    const { gate: _g, ...old } = DEFAULT_LIVE_CONFIG;
    void _g;
    expect(commandFor(running(old as LiveConfig), { mode: "DEMO" }, GATE_ROBOT_VERSION)).toMatchObject({ gateOn: true, gMaxTrades: 6 });
  });
  test("no tool runs on a robot file older than the filter, and the real-account checks still come first", () => {
    for (const mode of ["SCALPER", "BASKET", "ASIAN"] as const) {
      expect(minRobotVersion(mode)).toBe(GATE_ROBOT_VERSION);
      const config = { ...DEFAULT_LIVE_CONFIG, mode };
      expect(commandFor(running(config), { mode: "DEMO" }, GATE_ROBOT_VERSION - 1)).toMatchObject({ state: "STOPPED", reason: "OLD_ROBOT" });
      expect(commandFor(running(config), { mode: "DEMO" }, GATE_ROBOT_VERSION)).toMatchObject({ state: "RUNNING" });
      expect(commandFor(running(config), { mode: "REAL" }, GATE_ROBOT_VERSION)).toMatchObject({ state: "STOPPED", reason: "REAL_NOT_ALLOWED" });
    }
  });
});

describe("no-entry windows around high-impact releases", () => {
  const now = new Date("2026-11-23T10:00:00Z");
  const s = (iso: string) => Math.floor(Date.parse(iso) / 1000);
  test("each release becomes from-to in UTC seconds, before and after it", () => {
    expect(blackoutWindows([new Date("2026-11-23T13:30:00Z")], 30, 60, now)).toBe(`${s("2026-11-23T13:00:00Z")}-${s("2026-11-23T14:30:00Z")}`);
  });
  test("a window already running is kept; one already over is dropped", () => {
    const w = blackoutWindows([new Date("2026-11-23T09:30:00Z"), new Date("2026-11-23T08:00:00Z")], 30, 60, now);
    expect(w).toBe(`${s("2026-11-23T09:00:00Z")}-${s("2026-11-23T10:30:00Z")}`);
  });
  test("windows that overlap are merged and come out in time order", () => {
    const w = blackoutWindows([new Date("2026-11-23T15:00:00Z"), new Date("2026-11-23T13:30:00Z"), new Date("2026-11-23T20:00:00Z")], 30, 60, now);
    expect(w).toBe(`${s("2026-11-23T13:00:00Z")}-${s("2026-11-23T16:00:00Z")};${s("2026-11-23T19:30:00Z")}-${s("2026-11-23T21:00:00Z")}`);
  });
  test("releases beyond the horizon are left out, and zero minutes means no windows", () => {
    expect(blackoutWindows([new Date("2026-11-26T13:30:00Z")], 30, 60, now)).toBe("");
    expect(blackoutWindows([new Date("2026-11-23T13:30:00Z")], 0, 0, now)).toBe("");
    expect(blackoutWindows([new Date("2026-11-23T13:30:00Z")], 0, 15, now)).toBe(`${s("2026-11-23T13:30:00Z")}-${s("2026-11-23T13:45:00Z")}`);
  });
});

describe("the robot's report of the filter", () => {
  const base = { account: { login: "1", mode: "DEMO", balance: 1, equity: 1 }, symbol: "X", bid: 1, ask: 1, signal: "BUY", reason: "", runPnl: 0, positions: [], deals: [], finished: "", version: 6 };
  test("it carries the blocking check, today's entries and the loss-stop state", () => {
    const r = reportSchema.parse({ ...base, gateOn: true, block: "TREND", blockDetail: "H1 ↓ · M15 ↑", tradesToday: 2, dayPnl: -12.5, dailyLossHit: false });
    expect(r).toMatchObject({ block: "TREND", tradesToday: 2, dayPnl: -12.5, dailyLossHit: false });
    expect(reportSchema.safeParse(base).success).toBe(true); // older robot files send none of it
  });
  test("a long reason or detail is cut rather than refused, so the robot is not cut off", () => {
    const r = reportSchema.parse({ ...base, reason: "x".repeat(500), blockDetail: "y".repeat(500) });
    expect(r.reason).toHaveLength(300);
    expect(r.blockDetail).toHaveLength(120);
  });
});

describe("the many-method reading", () => {
  const run = (config: LiveConfig) => ({ state: "RUNNING" as const, runId: "r", closeAll: false, config });
  test("the counts and the threshold reach the robot", () => {
    expect(commandFor(run(DEFAULT_LIVE_CONFIG), { mode: "DEMO" }, GATE_ROBOT_VERSION, "mn", "", { buy: 11, sell: 2, total: 16 })).toMatchObject({ state: "RUNNING", cMin: 8, cBuy: 11, cSell: 2, cTotal: 16 });
  });
  test("with no reading the counts are zero, so the robot waits", () => {
    expect(commandFor(run(DEFAULT_LIVE_CONFIG), { mode: "DEMO" }, GATE_ROBOT_VERSION)).toMatchObject({ cMin: 8, cBuy: 0, cSell: 0, cTotal: 0 });
  });
  test("switching the filter off switches this check off", () => {
    const off = { ...DEFAULT_LIVE_CONFIG, gate: { ...DEFAULT_GATE, on: false } };
    expect(commandFor(run(off), { mode: "DEMO" }, GATE_ROBOT_VERSION, "mn", "", { buy: 9, sell: 1, total: 16 })).toMatchObject({ cMin: 0 });
  });
  test("the threshold is saved from the form and 0 turns it off", () => {
    expect(parseGate(form({ gAgree: "11" })).config!.gate.minAgree).toBe(11);
    expect(parseGate(form({ gAgree: "0" })).config!.gate.minAgree).toBe(0);
    expect(parseGate(form({ gAgree: "17" })).error).toBeTruthy();
    expect(parseGate(form({})).config!.gate.minAgree).toBe(8);
  });
});

describe("sizing and stops", () => {
  const run = (config: LiveConfig) => ({ state: "RUNNING" as const, runId: "r", closeAll: false, config });
  test("fixed lots is the default and sends no risk", () => {
    expect(commandFor(run(DEFAULT_LIVE_CONFIG), { mode: "DEMO" }, GATE_ROBOT_VERSION)).toMatchObject({ rMode: 0, rVal: 0, sMode: 0, sAtr: 0 });
  });
  test("dollars per trade and percent of balance are saved and sent", () => {
    const usd = parseGate(form({ gRiskMode: "USD", gRiskVal: "10" })).config!;
    expect(usd.gate).toMatchObject({ riskMode: "USD", riskValue: 10, siteStops: false });
    expect(commandFor(run(usd), { mode: "DEMO" }, GATE_ROBOT_VERSION)).toMatchObject({ rMode: 1, rVal: 10 });
    const pct = parseGate(form({ gRiskMode: "PCT", gRiskVal: "2", gSiteStops: "on" })).config!;
    expect(commandFor(run(pct), { mode: "DEMO" }, GATE_ROBOT_VERSION, "mn", "", { buy: 10, sell: 1, total: 16, atrH1: 9.876 })).toMatchObject({ rMode: 2, rVal: 2, sMode: 1, sAtr: 9.88, sStop: 1.5, sRR: 2 });
  });
  test("a risk mode needs its amount", () => {
    expect(parseGate(form({ gRiskMode: "USD", gRiskVal: "" })).error).toBeTruthy();
    expect(parseGate(form({ gRiskMode: "PCT", gRiskVal: "60" })).error).toBeTruthy();
  });
  test("site stops with no reading send a zero distance, so the robot waits", () => {
    const c = parseGate(form({ gRiskMode: "LOTS", gSiteStops: "on" })).config!;
    expect(commandFor(run(c), { mode: "DEMO" }, GATE_ROBOT_VERSION)).toMatchObject({ sMode: 1, sAtr: 0 });
  });
  test("the risk setting still applies with the filter switched off", () => {
    const c = parseGate(form({ gOn: undefined, gRiskMode: "USD", gRiskVal: "5" })).config!;
    expect(commandFor(run(c), { mode: "DEMO" }, GATE_ROBOT_VERSION)).toMatchObject({ gateOn: false, rMode: 1, rVal: 5 });
  });
});

describe("the reading tool", () => {
  const run = (config: LiveConfig) => ({ state: "RUNNING" as const, runId: "r", closeAll: false, config });
  const reading = parseConfig({ mode: "READING", rLots: "0.02" }, DEFAULT_LIVE_CONFIG).config!;
  test("it is saved with its lot size and keeps the filter", () => {
    expect(reading).toMatchObject({ mode: "READING", rule: { lots: 0.02 }, gate: { minAgree: 8 } });
  });
  test("it always sends a threshold and the site stop, with the counts", () => {
    const cmd = commandFor(run(reading), { mode: "DEMO" }, 10, "mn", "", { buy: 10, sell: 1, total: 14, atrH1: 12.345 });
    expect(cmd).toMatchObject({ state: "RUNNING", mode: "READING", lots: 0.02, maxPositions: 1, cMin: 8, cBuy: 10, cSell: 1, cTotal: 14, sMode: 1, sAtr: 12.35, sStop: 1.5, sRR: 2 });
  });
  test("with the filter off, or no threshold set, it waits for nine methods", () => {
    const off = { ...reading, gate: { ...reading.gate, on: false } };
    expect(commandFor(run(off), { mode: "DEMO" }, 10)).toMatchObject({ gateOn: false, cMin: 8, sMode: 1 });
    const none = { ...reading, gate: { ...reading.gate, minAgree: 0 } };
    expect(commandFor(run(none), { mode: "DEMO" }, 10)).toMatchObject({ cMin: 9 });
  });
  test("a robot file older than v3.30 is not started on it", () => {
    expect(commandFor(run(reading), { mode: "DEMO" }, 9)).toMatchObject({ state: "STOPPED", reason: "OLD_ROBOT" });
    expect(minRobotVersion("READING")).toBe(10);
  });
});
