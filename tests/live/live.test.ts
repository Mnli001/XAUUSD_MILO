import { parseConfig, commandFor, newToken, hashToken, reportSchema, DEFAULT_LIVE_CONFIG, type LiveConfig } from "@/lib/bot/live";

const cfg = (o: Partial<LiveConfig> = {}): LiveConfig => ({ ...DEFAULT_LIVE_CONFIG, ...o });
const demo = { mode: "DEMO" as const };
const real = { mode: "REAL" as const };

test("config accepts any positive lot size and has no daily limit", () => {
  const r = parseConfig({ lots: "25", maxPositions: "11", slAtr: "1.5", tpAtr: "2", profitTarget: "", maxLoss: "", allowReal: "on" });
  expect(r.error).toBeUndefined();
  expect(r.config).toEqual({ mode: "SCALPER", basket: DEFAULT_LIVE_CONFIG.basket, rule: DEFAULT_LIVE_CONFIG.rule, lots: 25, maxPositions: 11, slAtr: 1.5, tpAtr: 2, profitTarget: null, maxLoss: null, allowReal: true });
  expect(Object.keys(DEFAULT_LIVE_CONFIG)).not.toContain("dailyLossPct");
  expect(Object.keys(DEFAULT_LIVE_CONFIG)).not.toContain("maxSeconds"); // the robot works out its own duration
});
test("config rejects values the terminal could not act on", () => {
  for (const bad of [{ lots: "0" }, { lots: "-1" }, { lots: "abc" }, { maxPositions: "0" }, { slAtr: "0" }, { tpAtr: "-2" }, { profitTarget: "-5" }, { maxLoss: "0" }]) {
    expect(parseConfig({ lots: "0.1", maxPositions: "1", slAtr: "1", tpAtr: "1", ...bad }).error).toBeTruthy();
  }
  expect(parseConfig({ lots: "0.1", maxPositions: "1", slAtr: "1", tpAtr: "1" }).config!.allowReal).toBe(false);
});
test("a stopped bot tells the terminal to stop, and passes on a close-all request", () => {
  expect(commandFor({ state: "STOPPED", runId: null, closeAll: false, config: cfg() }, demo)).toMatchObject({ state: "STOPPED", closeAll: false });
  expect(commandFor({ state: "STOPPED", runId: null, closeAll: true, config: cfg() }, demo)).toMatchObject({ state: "STOPPED", closeAll: true });
});
test("a running bot sends its settings as flat numbers", () => {
  const c = commandFor({ state: "RUNNING", runId: "r1", closeAll: false, config: cfg({ lots: 0.5, maxPositions: 4, profitTarget: 100 }) }, demo);
  expect(c).toEqual({ state: "RUNNING", runId: "r1", lang: "mn", closeAll: false, mode: "SCALPER", lots: 0.5, maxPositions: 4, slAtr: 1.5, tpAtr: 2, profitTarget: 100, maxLoss: 0, reason: "" });
});
test("a real account is traded only when the owner switched that on", () => {
  const state = { state: "RUNNING" as const, runId: "r1", closeAll: false };
  expect(commandFor({ ...state, config: cfg({ allowReal: false }) }, real)).toMatchObject({ state: "STOPPED", reason: "REAL_NOT_ALLOWED" });
  expect(commandFor({ ...state, config: cfg({ allowReal: true }) }, real)).toMatchObject({ state: "RUNNING" });
  expect(commandFor({ ...state, config: cfg({ allowReal: false }) }, { mode: "CONTEST" })).toMatchObject({ state: "RUNNING" });
});
test("tokens are random and only their hash needs storing", () => {
  const a = newToken(), b = newToken();
  expect(a).toMatch(/^[0-9a-f]{48}$/);
  expect(a).not.toBe(b);
  expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  expect(hashToken(a)).toBe(hashToken(a));
  expect(hashToken(a)).not.toBe(hashToken(b));
});

test("a setting saved by an older version is ignored, not sent to the robot", () => {
  const old = { ...cfg(), maxSeconds: 120 } as unknown as LiveConfig;
  expect(commandFor({ state: "RUNNING", runId: "r", closeAll: false, config: old }, demo)).not.toHaveProperty("maxSeconds");
  expect(parseConfig({ lots: "0.1", maxPositions: "1", slAtr: "1", tpAtr: "1", maxSeconds: "120" }).config).not.toHaveProperty("maxSeconds");
});

describe("the basket tool", () => {
  const basketForm = { mode: "BASKET", bLots: "0.02", bCount: "10", bProfit: "5", bLoss: "12" };
  test("a config without a tool is the scalper, so stored configs keep working", () => {
    expect(parseConfig({ lots: "0.1", maxPositions: "2", slAtr: "1", tpAtr: "2" }).config).toMatchObject({ mode: "SCALPER", basket: DEFAULT_LIVE_CONFIG.basket });
  });
  test("saving the basket keeps the scalper's settings, and the other way round", () => {
    const scalper = parseConfig({ lots: "0.3", maxPositions: "4", slAtr: "1", tpAtr: "3", profitTarget: "40" }).config!;
    const basket = parseConfig(basketForm, scalper).config!;
    expect(basket).toMatchObject({ mode: "BASKET", lots: 0.3, maxPositions: 4, tpAtr: 3, profitTarget: 40, basket: { lots: 0.02, count: 10, profit: 5, loss: 12 } });
    const back = parseConfig({ mode: "SCALPER", lots: "0.5", maxPositions: "1", slAtr: "1", tpAtr: "1" }, basket).config!;
    expect(back).toMatchObject({ mode: "SCALPER", lots: 0.5, basket: { lots: 0.02, count: 10, profit: 5, loss: 12 } });
  });
  test("the basket must have both a profit to close at and a loss to close at", () => {
    expect(parseConfig({ ...basketForm, bProfit: "" }).error).toMatch(/ашг/i);
    expect(parseConfig({ ...basketForm, bLoss: "" }).error).toMatch(/алдагд/i);
    expect(parseConfig({ ...basketForm, bLoss: "0" }).error).toBeTruthy();
    expect(parseConfig({ ...basketForm, bCount: "0" }).error).toBeTruthy();
    expect(parseConfig({ ...basketForm, bCount: "101" }).error).toBeTruthy();
    expect(parseConfig({ ...basketForm, bLots: "25" }).config?.basket.lots).toBe(25); // lot size is the owner's choice
  });
  test("the terminal is told to open the whole basket and where to close it", () => {
    const config = parseConfig(basketForm).config!;
    const cmd = commandFor({ state: "RUNNING", runId: "r", closeAll: false, config }, { mode: "DEMO" }, 2);
    expect(cmd).toMatchObject({ state: "RUNNING", mode: "BASKET", lots: 0.02, maxPositions: 10, profitTarget: 5, maxLoss: 12 });
    expect(commandFor({ state: "RUNNING", runId: "r", closeAll: false, config: DEFAULT_LIVE_CONFIG }, { mode: "DEMO" }, 2).mode).toBe("SCALPER");
  });
  test("a robot file from before the basket existed is not started in basket mode", () => {
    const config = parseConfig(basketForm).config!;
    for (const v of [undefined, 1]) expect(commandFor({ state: "RUNNING", runId: "r", closeAll: false, config }, { mode: "DEMO" }, v)).toMatchObject({ state: "STOPPED", reason: "OLD_ROBOT" });
    expect(commandFor({ state: "RUNNING", runId: "r", closeAll: false, config: DEFAULT_LIVE_CONFIG }, { mode: "DEMO" }, undefined).state).toBe("RUNNING"); // the scalper still runs on it
  });
  test("reports may carry the robot's version", () => {
    const base = { account: { login: "1", mode: "DEMO", balance: 1, equity: 1 }, symbol: "X", bid: 1, ask: 1, signal: "NONE", reason: "", runPnl: 0, positions: [], deals: [], finished: "" };
    expect(reportSchema.safeParse({ ...base, version: 2 }).success).toBe(true);
    expect(reportSchema.safeParse(base).success).toBe(true);
  });
});

describe("the Asian breakout tool", () => {
  test("it has one setting, the lot size, and keeps the other tools' settings", () => {
    const basket = parseConfig({ mode: "BASKET", bLots: "0.02", bCount: "10", bProfit: "5", bLoss: "12" }).config!;
    const r = parseConfig({ mode: "ASIAN", rLots: "0.03", allowReal: "" }, basket);
    expect(r.config).toMatchObject({ mode: "ASIAN", rule: { lots: 0.03 }, basket: { count: 10 }, lots: 0.01 });
    expect(parseConfig({ mode: "ASIAN", rLots: "0" }).error).toBeTruthy();
    expect(parseConfig({ mode: "ASIAN", rLots: "" }).error).toBeTruthy();
    expect(parseConfig({ lots: "0.1", maxPositions: "2", slAtr: "1", tpAtr: "2" }).config).toMatchObject({ rule: DEFAULT_LIVE_CONFIG.rule });
  });
  test("the terminal is told to run the rule with one position and no money stops", () => {
    const config = parseConfig({ mode: "ASIAN", rLots: "0.03" }).config!;
    expect(commandFor({ state: "RUNNING", runId: "r", closeAll: false, config }, { mode: "DEMO" }, 3)).toMatchObject({ state: "RUNNING", mode: "ASIAN", lots: 0.03, maxPositions: 1, profitTarget: 0, maxLoss: 0 });
  });
  test("it needs the robot file that carries the rule", () => {
    const config = parseConfig({ mode: "ASIAN", rLots: "0.03" }).config!;
    for (const v of [undefined, 1, 2]) expect(commandFor({ state: "RUNNING", runId: "r", closeAll: false, config }, { mode: "DEMO" }, v)).toMatchObject({ state: "STOPPED", reason: "OLD_ROBOT" });
    expect(commandFor({ state: "RUNNING", runId: "r", closeAll: false, config }, { mode: "REAL" }, 3)).toMatchObject({ state: "STOPPED", reason: "REAL_NOT_ALLOWED" });
  });
});

describe("the robot's language", () => {
  const state = { state: "RUNNING" as const, runId: "r", closeAll: false, config: DEFAULT_LIVE_CONFIG };
  test("the command tells the robot which language to show, Mongolian unless told otherwise", () => {
    expect(commandFor(state, { mode: "DEMO" }, 4).lang).toBe("mn");
    expect(commandFor(state, { mode: "DEMO" }, 4, "en").lang).toBe("en");
    expect(commandFor({ ...state, state: "STOPPED" }, { mode: "DEMO" }, 4, "en").lang).toBe("en");
  });
});
