import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { simulateOrders } from "@/lib/bot/backtest";
import { DEFAULT_PARAMS } from "@/lib/bot/strategy";
import { finalCandles, upsertCandles, SYMBOL } from "@/lib/ingest/prices";
import { ingestCalendar } from "@/lib/ingest/calendar";
import { asianOrderOf, BROKER_RECORD, ORDER_ID_RULE_STEP } from "@/lib/setup/build";
import { commandFor, DEFAULT_LIVE_CONFIG, ordersField, stoppedCommand, ROBOT_FILE_VERSION, type LiveConfig, type SessionOrderFields } from "@/lib/bot/live";
import { handleSync, rotateToken, startBot, MAX_ROBOT_ACCOUNTS } from "@/lib/bot/liveDb";
import { getQuote } from "@/lib/feed";
import { signalHistory } from "@/lib/signalHistory";
import { NOT_SENT, emitResults } from "@/lib/signals";
import { justReopened, sendWeeklyReport, watchFeed } from "@/lib/watch";
import { telegramTiming } from "@/lib/telegram";
import { rangeSetup } from "@/lib/setup/setups";
import { ruleOf } from "@/lib/setup/sessionRules";
import { MN_VIEWER } from "@/lib/viewer";
import type { Candle } from "@/lib/analysis/indicators";
import { readFileSync } from "node:fs";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";

const M15 = 15 * 6e4;
const bar = (t: number, o: number, h: number, l: number, c: number): Candle => ({ time: new Date(t), open: o, high: h, low: l, close: c });

describe("closed bars", () => {
  const t0 = Date.UTC(2026, 10, 24, 9, 0);
  it("the newest stored bar is never final, even once its close time has passed: it may be a copy fetched while it formed", () => {
    const c = [bar(t0, 1, 2, 0, 1), bar(t0 + M15, 1, 2, 0, 1), bar(t0 + 2 * M15, 1, 2, 0, 1)];
    // 09:46: the 09:30 bar's close time has passed, but no newer bar is stored, so it was fetched before it closed
    expect(finalCandles(c, "15min", new Date(t0 + 3 * M15 + 6e4)).map((x) => x.time.getTime())).toEqual([t0, t0 + M15]);
    // a bar still inside its own time is not final either, newer bar or not
    expect(finalCandles(c, "15min", new Date(t0 + M15 + 6e4)).map((x) => x.time.getTime())).toEqual([t0]);
    const h4 = [bar(Date.UTC(2026, 10, 24, 0), 1, 2, 0, 1), bar(Date.UTC(2026, 10, 24, 4), 1, 2, 0, 1)];
    // 08:00: the 04:00 bar's time is over, but the hourly job has not stored the 08:00 bar yet
    expect(finalCandles(h4, "4h", new Date(Date.UTC(2026, 10, 24, 8, 1)))).toHaveLength(1);
  });
});

describe("robot orders", () => {
  const at = new Date(Date.UTC(2026, 10, 24, 13, 45));
  const now = new Date(at.getTime() + 2 * 6e4);
  const live = { status: "ACTIVE" as const, side: "BUY" as const, entry: 4006, stop: 4000, target: 4018, at, window: { rangeFrom: 12.5, rangeTo: 13.5, entryTo: 18, exitAt: new Date(Date.UTC(2026, 10, 24, 20)) } };
  it("ids are unique per rule even for the same bar, and carry absolute prices", () => {
    const a = asianOrderOf({ ...live, id: "asian-breakout" }, now)!;
    const b = asianOrderOf({ ...live, id: "ny-open-breakout" }, now)!;
    expect(a.id).not.toBe(b.id);
    expect(a.id).toBe(at.getTime() / 1000); // the Asian rule keeps the id older robots know
    expect(b.id).toBe(ORDER_ID_RULE_STEP + at.getTime() / 1000);
    expect(b).toMatchObject({ legacyId: at.getTime() / 1000, entry: 4006, sl: 4000, tp: 4018, risk: 6, rr: 2, ageSec: 120, dir: 1 });
  });
  const cfg = (o: Partial<LiveConfig> = {}): LiveConfig => ({ ...DEFAULT_LIVE_CONFIG, mode: "ASIAN", ...o });
  const order = (id: number, rule: SessionOrderFields["id"] = 0): SessionOrderFields => ({ id: id + rule, legacyId: id, dir: 1, risk: 6, rr: 2, ageSec: 90, exitAt: 1_800_000_000, entry: 4006, sl: 4000, tp: 4018 });
  it("the Asian tool sends every live order, the first also in the old single-order fields", () => {
    const c = commandFor({ state: "RUNNING", runId: "r", closeAll: false, config: cfg() }, { mode: "DEMO" }, ROBOT_FILE_VERSION, "mn", "", null, null, [order(1764000000), order(1764000000, ORDER_ID_RULE_STEP)]);
    expect(c.orders).toBe("1764000000,1,4006,4000,4018,90,1800000000,1;11764000000,1,4006,4000,4018,90,1800000000,1");
    expect(c).toMatchObject({ dId: 1764000000, dDir: 1, dRisk: 6, dRR: 2, dAge: 90, dExit: 1_800_000_000, oMaxAge: 1800, oSlipR: 0.3, state: "RUNNING" });
    expect(ordersField([])).toBe("");
  });
  it("the Asian tool trades the site's rule only: the entry filter goes out switched off, sizing is kept", () => {
    const gate = { ...DEFAULT_LIVE_CONFIG.gate, on: true, minAgree: 8, rsiMax: 70, riskMode: "PCT" as const, riskValue: 2, protect: true };
    const c = commandFor({ state: "RUNNING", runId: "r", closeAll: false, config: cfg({ gate }) }, { mode: "DEMO" }, 13, "mn", "1-2", { buy: 9, sell: 1, total: 14 }, null, []);
    expect(c).toMatchObject({ state: "RUNNING", gateOn: false, gTrend: false, cMin: 0, gRsiMax: 0, gExtAtr: 0, gAtrMin: 0, gAtrMax: 0, gMaxTrades: 0, gDailyLossPct: 0, blackouts: "", protect: false, rMode: 2, rVal: 2 });
    expect(c.gSessionEnd).toBe(c.gSessionStart); // all day: no trading-hours window
    // the day trader still gets its filter
    expect(commandFor({ state: "RUNNING", runId: "r", closeAll: false, config: cfg({ mode: "DAY", gate }) }, { mode: "DEMO" }, 13, "mn", "1-2")).toMatchObject({ gateOn: true, blackouts: "1-2" });
  });
  it("the robot file is the new version and knows the order list", () => {
    const src = readFileSync("mt5/XauBot.mq5", "utf8");
    expect(src).toContain(`#define ROBOT_VERSION ${ROBOT_FILE_VERSION}`);
    expect(src).toContain('#property version   "3.80"');
    for (const part of ['JStr(body, "orders")', "OrderTaken(id)", "SendMarketAt(", "gOSlipR"]) expect(src).toContain(part);
    // the time exit runs whatever tool is selected
    expect(src).toMatch(/void OnTimer\(\)\s*\{\s*if\(IsRuleTool\(\)\) return;\s*AsianTimeExit\(\);/);
  });
  it("a bare stop carries no signal data", () => {
    expect(stoppedCommand("NO_ACCESS")).toMatchObject({ state: "STOPPED", reason: "NO_ACCESS", dId: 0, orders: "", cBuy: 0, cSell: 0, cTotal: 0, sAtr: 0, blackouts: "", gateOn: false });
  });
});

describe("robot sync safety", () => {
  const now = new Date("2026-11-24T10:00:00Z");
  const report = (login: string, o: Record<string, unknown> = {}) => ({
    account: { login, mode: "DEMO", balance: 1000, equity: 1000 }, symbol: "XAUUSD", bid: 4100, ask: 4100.3, signal: "NONE", reason: "", runPnl: 0,
    positions: [], deals: [], finished: "", version: 14, ...o,
  });
  beforeEach(async () => { await resetDb(); delete process.env.FEED_BOT_LOGIN; });

  it("an owner without access gets a bare stop, with no reading, order or news windows", async () => {
    const u = await makeUser("noaccess@x.mn");
    await db.execute(sql`UPDATE users SET access_until = '2027-06-01' WHERE id = ${u.id}`);
    const token = await rotateToken(u.id);
    expect(await handleSync(token, report("1001"), now)).toMatchObject({ state: "STOPPED" });
    await startBot(u.id, now, "1001");
    await db.execute(sql`UPDATE users SET access_until = '2020-01-01' WHERE id = ${u.id}`);
    const cmd = await handleSync(token, report("1001"), now);
    expect(cmd).toEqual(stoppedCommand("NO_ACCESS"));
    const [row] = await db.select().from(schema.botLive).where(sql`user_id = ${u.id}`);
    expect(row).toMatchObject({ state: "STOPPED", stopReason: "NO_ACCESS" });
  });
  it(`a user links at most ${MAX_ROBOT_ACCOUNTS} accounts; one more is told why it is stopped`, async () => {
    const u = await makeUser("many@x.mn");
    await db.execute(sql`UPDATE users SET access_until = '2027-06-01' WHERE id = ${u.id}`);
    const token = await rotateToken(u.id);
    for (const login of ["1", "2", "3"]) expect((await handleSync(token, report(login), now))!.reason).not.toBe("TOO_MANY_ACCOUNTS");
    expect(await handleSync(token, report("4"), now)).toEqual(stoppedCommand("TOO_MANY_ACCOUNTS"));
    expect(await db.select().from(schema.botLive).where(sql`user_id = ${u.id}`)).toHaveLength(3);
    expect((await handleSync(token, report("2"), now))!.reason).not.toBe("TOO_MANY_ACCOUNTS"); // known ones still work
  });
  it("a body that is far too large, or an absurd reason, is refused before anything is read", async () => {
    const u = await makeUser("big@x.mn");
    const token = await rotateToken(u.id);
    expect(await handleSync(token, report("1", { reason: "x".repeat(5000) }), now)).toBeNull();
    expect(await handleSync(token, { ...report("1"), junk: "x".repeat(300_000) }, now)).toBeNull();
    expect(await handleSync(token, report("1", { reason: "x".repeat(1000) }), now)).not.toBeNull(); // long but sane: cut, kept
  });
  it("only one robot sets the site's price: the first admin's first account, or the dedicated FEED_BOT_LOGIN", async () => {
    const admin = await makeUser("feedadmin@x.mn", "ADMIN");
    const token = await rotateToken(admin.id);
    await handleSync(token, report("200", { bid: 4200, ask: 4200.3 }), now); // the admin's first account
    expect(await getQuote(now)).toMatchObject({ price: 4200 });
    await handleSync(token, report("300", { bid: 4300, ask: 4300.3 }), new Date(now.getTime() + 1000)); // a second account
    expect(await getQuote(new Date(now.getTime() + 1000))).toMatchObject({ price: 4200 });
    const other = await makeUser("admin2@x.mn", "ADMIN");
    await handleSync(await rotateToken(other.id), report("100", { bid: 4400, ask: 4400.3 }), new Date(now.getTime() + 2000)); // a later admin
    expect(await getQuote(new Date(now.getTime() + 2000))).toMatchObject({ price: 4200 });
    process.env.FEED_BOT_LOGIN = "300";
    await handleSync(token, report("300", { bid: 4301, ask: 4301.3 }), new Date(now.getTime() + 3000));
    expect(await getQuote(new Date(now.getTime() + 3000))).toMatchObject({ price: 4301 });
    delete process.env.FEED_BOT_LOGIN;
  });
});

describe("signals never sent", () => {
  const t0 = new Date("2026-11-24T08:30:00Z");
  const sig = (key: string, sentTo: number, createdAt = t0) => ({ key, setupId: "asian-breakout", name: "A", side: "BUY", entry: 4006, stop: 4000, target: 4024, createdAt, sentTo });
  const day = () => Array.from({ length: 96 }, (_, i) => bar(Date.UTC(2026, 10, 24) + i * M15, 4006, i === 40 ? 4025 : 4008, i === 40 ? 4010 : 4004, 4006));
  const realSleep = telegramTiming.sleep;
  beforeEach(async () => { await resetDb(); telegramTiming.sleep = async () => {}; });
  afterEach(() => { telegramTiming.sleep = realSleep; });

  it("are left out of the history and its totals unless asked for, and then marked", async () => {
    await db.insert(schema.signals).values([sig("sent", 2), sig("late", NOT_SENT, new Date(t0.getTime() + M15))]);
    await upsertCandles(SYMBOL, "15min", day());
    const now = new Date("2026-11-24T14:00:00Z");
    expect((await signalHistory(now)).map((r) => r.key)).toEqual(["sent"]);
    expect((await signalHistory(now, 60, { includeUnsent: true })).map((r) => [r.key, r.unsent])).toEqual([["late", true], ["sent", false]]);
  });
  it("get no result message and are not in the weekly report", async () => {
    const u = await makeUser("weekly@x.mn");
    await db.execute(sql`UPDATE users SET access_until = '2027-01-01', telegram_chat_id = '111' WHERE id = ${u.id}`);
    await db.insert(schema.signals).values([sig("late", NOT_SENT)]);
    const sent: string[] = [];
    expect(await emitResults(new Date("2026-11-24T11:00:00Z"), { send: async (_c, _p, cap) => { sent.push(cap); return true; }, bars: day() })).toBe(0);
    expect(sent).toHaveLength(0);
    await db.execute(sql`DELETE FROM app_state WHERE key = 'weekly:2026-W49'`);
    await upsertCandles(SYMBOL, "15min", day());
    const texts: string[] = [];
    expect(await sendWeeklyReport(new Date(Date.UTC(2026, 10, 30, 1, 5)), async (_c, html) => { texts.push(html); return true; })).toBe(0); // nothing that went out
    await db.execute(sql`DELETE FROM app_state WHERE key = 'weekly:2026-W49'`);
    expect(texts.join("\n")).not.toContain("1 дохио");
  });
});

describe("feed watch", () => {
  it("the first hour after the weekly reopen is quiet, summer or winter", () => {
    expect(justReopened(new Date(Date.UTC(2026, 10, 29, 23, 30)))).toBe(true); // winter: opens 23:00
    expect(justReopened(new Date(Date.UTC(2026, 6, 26, 22, 30)))).toBe(true); // summer: opens 22:00
    expect(justReopened(new Date(Date.UTC(2026, 10, 30, 0, 30)))).toBe(false); // Monday
  });
  it("no 'prices late' alert on a Sunday reopen", async () => {
    await resetDb();
    await db.execute(sql`DELETE FROM app_state WHERE key = 'feed_alert'`);
    await upsertCandles(SYMBOL, "15min", [bar(Date.UTC(2026, 10, 27, 20, 45), 1, 2, 0, 1)]);
    const sent: string[] = [];
    expect(await watchFeed(new Date(Date.UTC(2026, 10, 29, 23, 40)), async (_c, h) => { sent.push(h); return true; })).toBeNull();
    expect(sent).toHaveLength(0);
  });
});

describe("calendar", () => {
  it("a rescheduled FRED release is moved: the old date inside the window is deleted, admin rows and filled-in rows stay", async () => {
    await resetDb();
    const now = new Date("2026-11-20T00:00:00Z");
    const old = new Date("2026-12-10T13:30:00Z"), moved = new Date("2026-12-11T13:30:00Z"), other = new Date("2026-12-05T13:30:00Z");
    await ingestCalendar({ fetchEvents: async () => [{ type: "CPI", time: old }, { type: "CPI", time: other }, { type: "NFP", time: other }] }, now);
    await db.insert(schema.economicEvents).values({ type: "CPI", title: "x", country: "АНУ", impact: "HIGH", time: new Date("2026-12-12T13:30:00Z"), source: "admin" }); // i18n-ok: stored key
    await db.update(schema.economicEvents).set({ actual: "3.0%" }).where(sql`type = 'CPI' AND time = ${other}`);
    const r = await ingestCalendar({ fetchEvents: async () => [{ type: "CPI", time: moved }] }, now); // NFP returned nothing: left alone
    expect(r).toMatchObject({ ok: true, removed: 1 });
    const rows = (await db.select().from(schema.economicEvents)).map((e) => `${e.type} ${e.time.toISOString()} ${e.source}`).sort();
    expect(rows).toEqual([
      "CPI 2026-12-05T13:30:00.000Z fred", "CPI 2026-12-11T13:30:00.000Z fred", "CPI 2026-12-12T13:30:00.000Z admin", "NFP 2026-12-05T13:30:00.000Z fred",
    ]);
  });
});

describe("replay and readings", () => {
  it("a stop gapped through fills at the bar's open, not at the stop", () => {
    const P = { ...DEFAULT_PARAMS, spread: 0, breakeven: false };
    const T = Date.UTC(2026, 10, 17, 8);
    const bars = [bar(T, 4000, 4001, 3999, 4000), bar(T + M15, 4000, 4002, 3999, 4001), bar(T + 2 * M15, 3990, 3992, 3985, 3988)];
    const r = simulateOrders(bars, [{ side: "BUY", stopDist: 5, targetDist: 10 }, null, null], P, 10_000);
    expect(r.trades[0]).toMatchObject({ reason: "SL", exitPrice: 3990 });
    expect(r.trades[0].r).toBeCloseTo(-2);
  });
  it("a trade held overnight and read after midnight closes 'today', not 'tomorrow'", () => {
    const rule = ruleOf("ny-late-breakout")!;
    const day = Date.UTC(2026, 10, 24); // Tuesday
    const m15: Candle[] = [];
    for (let i = 0; i < 96 + 4; i++) {
      const t = day + i * M15, h = (t - day) / 36e5;
      const p = h >= 13.5 && h < 14.5 ? 4000 : h < 14.75 ? 4000 : 4010;
      m15.push(bar(t, p, p + (h >= 13.5 && h < 14.5 ? 3 : 1), p - (h >= 13.5 && h < 14.5 ? 3 : 1), h >= 14.5 && h < 14.75 ? 4010 : p));
    }
    const scores = { daily: 40, h4: 1, atrD: 10 };
    const evening = rangeSetup(rule, m15.filter((b) => b.time.getTime() < day + 15 * 36e5), scores, [], new Date(day + 15 * 36e5 + 6e4), MN_VIEWER); // 23:01 in Ulaanbaatar
    expect(evening.status).toBe("ACTIVE");
    expect(evening.detail).toContain("маргааш 15:00");
    const night = rangeSetup(rule, m15, scores, [], new Date(day + 24.5 * 36e5), MN_VIEWER, "2026-11-24");
    expect(night.status).toBe("ACTIVE");
    expect(night.detail).toContain("өнөөдөр 15:00"); // 00:30 UTC is 08:30 in Ulaanbaatar: the 15:00 exit is today
  });
  it("the broker record says plainly what it is", () => {
    expect(BROKER_RECORD).toMatchObject({ kind: "research", checkedOn: "2026-11-26", note: expect.stringContaining("without the news filter") });
    expect(BROKER_RECORD.noteText.en).toContain("not live trades");
  });
});
