import { parseConfig, commandFor, newToken, hashToken, DEFAULT_LIVE_CONFIG, type LiveConfig } from "@/lib/bot/live";

const cfg = (o: Partial<LiveConfig> = {}): LiveConfig => ({ ...DEFAULT_LIVE_CONFIG, ...o });
const demo = { mode: "DEMO" as const };
const real = { mode: "REAL" as const };

test("config accepts any positive lot size and has no daily limit", () => {
  const r = parseConfig({ lots: "25", maxPositions: "11", slAtr: "1.5", tpAtr: "2", profitTarget: "", maxLoss: "", maxSeconds: "", allowReal: "on" });
  expect(r.error).toBeUndefined();
  expect(r.config).toEqual({ lots: 25, maxPositions: 11, slAtr: 1.5, tpAtr: 2, profitTarget: null, maxLoss: null, maxSeconds: null, allowReal: true });
  expect(Object.keys(DEFAULT_LIVE_CONFIG)).not.toContain("dailyLossPct");
});
test("config rejects values the terminal could not act on", () => {
  for (const bad of [{ lots: "0" }, { lots: "-1" }, { lots: "abc" }, { maxPositions: "0" }, { slAtr: "0" }, { tpAtr: "-2" }, { profitTarget: "-5" }, { maxSeconds: "0" }]) {
    expect(parseConfig({ lots: "0.1", maxPositions: "1", slAtr: "1", tpAtr: "1", ...bad }).error).toBeTruthy();
  }
  expect(parseConfig({ lots: "0.1", maxPositions: "1", slAtr: "1", tpAtr: "1" }).config!.allowReal).toBe(false);
});
test("a stopped bot tells the terminal to stop, and passes on a close-all request", () => {
  expect(commandFor({ state: "STOPPED", runId: null, closeAll: false, config: cfg() }, demo)).toMatchObject({ state: "STOPPED", closeAll: false });
  expect(commandFor({ state: "STOPPED", runId: null, closeAll: true, config: cfg() }, demo)).toMatchObject({ state: "STOPPED", closeAll: true });
});
test("a running bot sends its settings as flat numbers", () => {
  const c = commandFor({ state: "RUNNING", runId: "r1", closeAll: false, config: cfg({ lots: 0.5, maxPositions: 4, profitTarget: 100, maxSeconds: 90 }) }, demo);
  expect(c).toEqual({ state: "RUNNING", runId: "r1", closeAll: false, lots: 0.5, maxPositions: 4, slAtr: 1.5, tpAtr: 2, profitTarget: 100, maxLoss: 0, maxSeconds: 90, reason: "" });
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
