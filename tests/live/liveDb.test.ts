import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DEFAULT_GATE, DEFAULT_LIVE_CONFIG, ROBOT_FILE_VERSION, type BotMode } from "@/lib/bot/live";
import { getLive, saveLiveConfig, saveGateConfig, saveSimpleConfig, startBot, stopBot, requestCloseAll, rotateToken, handleSync, getLiveView, getEntryStats } from "@/lib/bot/liveDb";
import { POST } from "@/app/api/bot/sync/route";
import type { User } from "@/lib/db/schema";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/users";

let admin: User, user: User, token: string, userToken: string;
const now = new Date("2026-11-23T10:00:00Z");
const report = (o: Record<string, unknown> = {}) => ({
  account: { login: "51234567", mode: "DEMO", balance: 10000, equity: 10012.5, currency: "USD" },
  symbol: "XAUUSDm", bid: 4100.1, ask: 4100.4, signal: "BUY", reason: "EMA9>EMA21", runPnl: 12.5,
  positions: [{ ticket: "11", side: "BUY", lots: 0.05, openPrice: 4099, sl: 4095, tp: 4107, profit: 12.5 }],
  deals: [], finished: "", plannedSeconds: 360, elapsedSeconds: 42, version: ROBOT_FILE_VERSION, ...o,
});
/** Puts a bot on one of the older tools, as a robot saved before Start always ran the Setup signals would be. */
const setMode = (userId: string, mode: BotMode) => db.execute(sql`UPDATE bot_live SET config = jsonb_set(config, '{mode}', to_jsonb(${mode}::text)) WHERE user_id = ${userId}`);
/** Starts a bot and keeps it on an older tool, to check that tool still reaches the robot as before. */
const runAs = async (userId: string, mode: BotMode) => { await startBot(userId, now); await setMode(userId, mode); };

beforeEach(async () => {
  await resetDb();
  await db.execute(sql`TRUNCATE bot_tokens, bot_live, bot_deals`);
  admin = await makeUser("admin@x.mn", "ADMIN");
  user = await makeUser("u@x.mn");
  await db.execute(sql`UPDATE users SET access_until = ${new Date("2027-06-01T00:00:00Z")} WHERE id = ${user.id}`);
  token = await rotateToken(admin.id);
  userToken = await rotateToken(user.id);
});

test("each user has a bot of their own", async () => {
  await saveLiveConfig(user.id, { lots: "0.7", maxPositions: "2", slAtr: "1", tpAtr: "1" });
  await startBot(user.id, now);
  expect(await getLive(user.id)).toMatchObject({ state: "RUNNING", config: { lots: 0.7 } });
  expect(await getLive(admin.id)).toMatchObject({ state: "STOPPED", config: { lots: 0.01 } }); // the other bot is untouched
  expect(await handleSync(userToken, report(), now)).toMatchObject({ state: "RUNNING", lots: 0.7 });
  expect(await handleSync(token, report({ account: { login: "99990001", mode: "DEMO", balance: 50, equity: 50 } }), now)).toMatchObject({ state: "STOPPED", lots: 0.01 });
  expect(await getLiveView(user.id, now)).toMatchObject({ state: "RUNNING", accountLogin: "••••4567", balance: 10000 });
  expect(await getLiveView(admin.id, now)).toMatchObject({ state: "STOPPED", accountLogin: "••••0001", balance: 50 });
  await stopBot(admin.id, "MANUAL", now);
  await requestCloseAll(admin.id);
  expect((await getLive(user.id)).state).toBe("RUNNING");
});
test("two users' deals with the same ticket number stay apart", async () => {
  const deal = (profit: number) => ({ ticket: "500", side: "BUY", lots: 0.05, openPrice: 4099, closePrice: 4101, profit, closeTime: "2026-11-23T09:59:00Z" });
  await handleSync(token, report({ deals: [deal(30)] }), now);
  await handleSync(userToken, report({ deals: [deal(-7)] }), now);
  expect(await getLiveView(admin.id, now)).toMatchObject({ dealCount: 1, pnl24h: 30 });
  expect(await getLiveView(user.id, now)).toMatchObject({ dealCount: 1, pnl24h: -7 });
});
test("a user whose access ran out cannot keep the bot running", async () => {
  await db.execute(sql`UPDATE users SET access_until = ${new Date(now.getTime() + 3600e3)} WHERE id = ${user.id}`);
  await startBot(user.id, now);
  expect(await handleSync(userToken, report(), now)).toMatchObject({ state: "RUNNING" });
  const later = new Date(now.getTime() + 2 * 3600e3);
  expect(await handleSync(userToken, report(), later)).toMatchObject({ state: "STOPPED", reason: "NO_ACCESS" });
  expect(await getLive(user.id)).toMatchObject({ state: "STOPPED", stopReason: "NO_ACCESS" });
});
test("deleting a user removes their bot and deals", async () => {
  await handleSync(userToken, report({ deals: [{ ticket: "1", side: "BUY", lots: 0.05, openPrice: 1, closePrice: 2, profit: 1, closeTime: "2026-11-23T09:59:00Z" }] }), now);
  await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);
  expect(await handleSync(userToken, report(), now)).toBeNull();
  const left = await db.execute(sql`SELECT count(*)::int AS n FROM bot_deals`);
  expect(left.rows[0].n).toBe(0);
});
test("sync needs the right token", async () => {
  expect(await handleSync("wrong-token", report(), now)).toBeNull();
  expect(await handleSync("", report(), now)).toBeNull();
  expect(await handleSync(token, report(), now)).toMatchObject({ state: "STOPPED" });
  const old = token;
  token = await rotateToken(admin.id);
  expect(await handleSync(old, report(), now)).toBeNull(); // rotating invalidates the old one
});
test("start, sync, stop", async () => {
  expect((await saveLiveConfig(admin.id, { lots: "0.3", maxPositions: "5", slAtr: "1.5", tpAtr: "2", profitTarget: "40" })).error).toBeUndefined();
  await startBot(admin.id, now);
  const cmd = (await handleSync(token, report(), now))!;
  // Start always runs the Setup signals: a bot still set to the retired scalper moves over, one trade at a time, with the lot size it had.
  expect(cmd).toMatchObject({ state: "RUNNING", mode: "ASIAN", lots: 0.3, maxPositions: 1, closeAll: false });
  expect(cmd.runId).toBeTruthy();

  const v = await getLiveView(admin.id, new Date(now.getTime() + 3000));
  expect(v).toMatchObject({ state: "RUNNING", online: true, signal: "BUY", reason: "EMA9>EMA21", balance: 10000, equity: 10012.5, accountMode: "DEMO", accountLogin: "••••4567", symbol: "XAUUSDm", runPnl: 12.5, plannedSeconds: 360, elapsedSeconds: 42 });
  expect(v.positions).toHaveLength(1);
  expect((await getLiveView(admin.id, new Date(now.getTime() + 60_000))).online).toBe(false); // terminal went quiet

  await stopBot(admin.id, "MANUAL", now);
  expect(await handleSync(token, report(), now)).toMatchObject({ state: "STOPPED", closeAll: true }); // stop also closes
  expect(await handleSync(token, report({ positions: [] }), now)).toMatchObject({ state: "STOPPED", closeAll: false }); // …until nothing is open
});
test("the terminal reporting that a run finished stops the bot with that reason", async () => {
  await startBot(admin.id, now);
  await handleSync(token, report(), now);
  const cmd = await handleSync(token, report({ finished: "TARGET", positions: [] }), new Date(now.getTime() + 5000));
  expect(cmd).toMatchObject({ state: "STOPPED" });
  expect(await getLive(admin.id)).toMatchObject({ state: "STOPPED", stopReason: "TARGET" });
});
test("a real account stops the run unless real trading was switched on", async () => {
  await startBot(admin.id, now);
  const realReport = report({ account: { login: "777", mode: "REAL", balance: 500, equity: 500, currency: "USD" } });
  expect(await handleSync(token, realReport, now)).toMatchObject({ state: "STOPPED", reason: "REAL_NOT_ALLOWED" });
  expect(await getLive(admin.id)).toMatchObject({ state: "STOPPED", stopReason: "REAL_NOT_ALLOWED" });
  await saveLiveConfig(admin.id, { lots: "0.1", maxPositions: "1", slAtr: "1", tpAtr: "1", allowReal: "on" });
  await startBot(admin.id, now);
  expect(await handleSync(token, realReport, now)).toMatchObject({ state: "RUNNING" });
});
test("closed deals are stored once and summed for the last 24 hours", async () => {
  await startBot(admin.id, now);
  const deal = (ticket: string, profit: number, at: string) => ({ ticket, side: "BUY", lots: 0.05, openPrice: 4099, closePrice: 4101, profit, closeTime: at });
  const deals = [deal("1", 30, "2026-11-23T09:59:00Z"), deal("2", -10, "2026-11-23T09:59:30Z"), deal("3", 99, "2026-11-21T00:00:00Z")];
  await handleSync(token, report({ deals }), now);
  await handleSync(token, report({ deals }), now);
  const v = await getLiveView(admin.id, now);
  expect(v.deals).toHaveLength(3);
  expect(v.pnl24h).toBeCloseTo(20);
  expect(v.deals[0].ticket).toBe("2"); // newest first
});
test("malformed reports are rejected without changing anything", async () => {
  expect(await handleSync(token, { nonsense: true }, now)).toBeNull();
  expect(await handleSync(token, report({ account: { login: "1", mode: "DEMO", balance: "lots", equity: 1 } }), now)).toBeNull();
  expect((await getLiveView(admin.id, now)).online).toBe(false);
});
test("the sync route answers 401 without a token and 200 with one", async () => {
  const call = (headers: Record<string, string>) => POST(new Request("http://x/api/bot/sync", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(report()) }));
  expect((await call({})).status).toBe(401);
  expect((await call({ "x-bot-token": "nope" })).status).toBe(401);
  const ok = await call({ "x-bot-token": token });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toMatchObject({ state: "STOPPED" });
});

test("reports from a robot that does not send its timing are still accepted", async () => {
  const { plannedSeconds: _p, elapsedSeconds: _e, ...old } = report();
  void _p; void _e;
  expect(await handleSync(token, old, now)).toMatchObject({ state: "STOPPED" });
  expect(await getLiveView(admin.id, now)).toMatchObject({ plannedSeconds: null, elapsedSeconds: null });
});

test("the basket tool runs end to end: saved, started, refused on an old robot file, reported", async () => {
  expect((await saveLiveConfig(admin.id, { mode: "BASKET", bLots: "0.02", bCount: "8", bProfit: "6", bLoss: "15" })).error).toBeUndefined();
  await runAs(admin.id, "BASKET");
  expect(await handleSync(token, report({ version: 8 }), now)).toMatchObject({ state: "STOPPED", reason: "OLD_ROBOT" });
  expect(await getLive(admin.id)).toMatchObject({ state: "STOPPED", stopReason: "OLD_ROBOT" });
  await runAs(admin.id, "BASKET");
  expect(await handleSync(token, report({ version: 9 }), now)).toMatchObject({ state: "RUNNING", mode: "BASKET", lots: 0.02, maxPositions: 8, profitTarget: 6, maxLoss: 15 });
  expect(await getLiveView(admin.id, now)).toMatchObject({ robotVersion: 9, config: { mode: "BASKET", basket: { count: 8 } } });
});

test("the robot is told its owner's language", async () => {
  expect((await handleSync(userToken, report(), now))!.lang).toBe("mn");
  await db.execute(sql`UPDATE users SET locale = 'en' WHERE id = ${user.id}`);
  expect((await handleSync(userToken, report(), now))!.lang).toBe("en");
  expect((await handleSync(token, report(), now))!.lang).toBe("mn"); // the other user's robot is unaffected
});

describe("the entry filter", () => {
  const gateForm = { gOn: "on", gTrend: "on", gStart: "15", gEnd: "1", gNewsBefore: "30", gNewsAfter: "60", gAtrMin: "1.5", gAtrMax: "25", gSpreadPct: "10", gRsiMax: "70", gExtAtr: "2", gMaxTrades: "4", gDailyLoss: "2" };
  const release = (time: string, impact: "HIGH" | "MEDIUM" = "HIGH") =>
    db.insert(schema.economicEvents).values({ type: `T-${time}-${impact}`, title: "CPI", country: "US", impact, time: new Date(time), source: "test" });

  test("a bot saved before the filter existed gets the default filter", async () => {
    await getLive(admin.id);
    await db.execute(sql`UPDATE bot_live SET config = config - 'gate' WHERE user_id = ${admin.id}`);
    expect((await getLive(admin.id)).config.gate).toEqual(DEFAULT_LIVE_CONFIG.gate);
    expect(DEFAULT_LIVE_CONFIG.gate).toEqual({ ...DEFAULT_GATE, riskMode: "PCT", riskValue: 1 });
  });
  test("it is saved on its own, keeps the tool settings, and reaches the robot", async () => {
    await saveLiveConfig(admin.id, { lots: "0.3", maxPositions: "2", slAtr: "1", tpAtr: "2" });
    expect((await saveGateConfig(admin.id, gateForm)).error).toBeUndefined();
    expect((await saveGateConfig(admin.id, { ...gateForm, gStart: "25" })).error).toBeTruthy();
    expect((await getLive(admin.id)).config).toMatchObject({ lots: 0.3, gate: { maxTradesDay: 4, dailyLossPct: 2 } });
    await runAs(admin.id, "DAY");
    expect(await handleSync(token, report(), now)).toMatchObject({ state: "RUNNING", lots: 0.3, gateOn: true, gMaxTrades: 4, gDailyLossPct: 2 });
  });
  test("the robot is sent the windows around stored HIGH-impact releases only", async () => {
    await release("2026-11-23T13:30:00Z");
    await release("2026-11-23T12:00:00Z", "MEDIUM");
    await release("2026-11-20T13:30:00Z"); // long over
    await getLive(admin.id);
    await setMode(admin.id, "DAY"); // the Setup signals take no news windows (see the test below)
    const s = (iso: string) => Math.floor(Date.parse(iso) / 1000);
    expect((await handleSync(token, report(), now))!.blackouts).toBe(`${s("2026-11-23T13:00:00Z")}-${s("2026-11-23T14:30:00Z")}`);
    await saveGateConfig(admin.id, { ...gateForm, gNewsBefore: "0", gNewsAfter: "0" });
    expect((await handleSync(token, report(), now))!.blackouts).toBe("");
  });
  test("the page shows why the robot is not entering, today's count and the loss stop", async () => {
    await handleSync(token, report({ gateOn: true, block: "NEWS", blockDetail: "25 min", tradesToday: 3, dayPnl: -40.5, dailyLossHit: false }), now);
    expect(await getLiveView(admin.id, now)).toMatchObject({ gateOn: true, block: "NEWS", blockDetail: "25 min", tradesToday: 3, dayPnl: -40.5, dailyLossHit: false });
    await handleSync(token, report({ version: 5 }), now); // an older file reports none of it
    expect(await getLiveView(admin.id, now)).toMatchObject({ gateOn: null, block: null, tradesToday: null, dailyLossHit: null });
  });
  test("the robot reporting the daily loss stop ends the run with that reason", async () => {
    await startBot(admin.id, now);
    await handleSync(token, report({ finished: "DAILY_LOSS", positions: [], dailyLossHit: true }), now);
    expect(await getLive(admin.id)).toMatchObject({ state: "STOPPED", stopReason: "DAILY_LOSS" });
  });
  test("the sync route tells a report it cannot read (400) from a wrong token (401)", async () => {
    const call = (headers: Record<string, string>, body: unknown) => POST(new Request("http://x/api/bot/sync", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
    expect((await call({ "x-bot-token": token }, { nonsense: true })).status).toBe(400);
    expect((await call({ "x-bot-token": "nope" }, report())).status).toBe(401);
    expect((await call({ "x-bot-token": token }, report({ reason: "x".repeat(400) }))).status).toBe(200); // a long reason is cut, not refused
  });
});

describe("entries, presets and trade notices", () => {
  test("a position is recorded once with what the reading said, and joins its closing deal", async () => {
    await handleSync(token, report(), now);
    await handleSync(token, report(), new Date(now.getTime() + 1000));
    const entries = await db.select().from(schema.botEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ userId: admin.id, ticket: "11", side: "BUY", lots: 0.05, session: "Лондон" }); // i18n-ok: the stored session key (18:00 UB)
    const deal = { ticket: "900", position: "11", side: "BUY", lots: 0.05, openPrice: 4099, closePrice: 4104, profit: 25, closeTime: now.toISOString() };
    await handleSync(token, report({ positions: [], deals: [deal] }), new Date(now.getTime() + 2000));
    const stats = await getEntryStats(admin.id, "51234567");
    expect(stats.trades).toBe(1);
    expect(stats.bySession).toEqual([{ key: "Лондон", trades: 1, wins: 1, pnl: 25 }]); // i18n-ok
    expect(stats.byBacking[0]).toMatchObject({ trades: 1, wins: 1, pnl: 25 });
  });
  test("a deal from an older robot file, without its position, is stored and simply not grouped", async () => {
    const deal = { ticket: "901", side: "SELL", lots: 0.01, openPrice: 4100, closePrice: 4101, profit: -1, closeTime: now.toISOString() };
    await handleSync(token, report({ positions: [], deals: [deal] }), now);
    const view = await getLiveView(admin.id, now);
    expect(view.dealCount).toBe(1);
    expect((await getEntryStats(admin.id, "51234567")).trades).toBe(0);
  });
  test("a preset fills the filter in one go and keeps the tool settings", async () => {
    await saveLiveConfig(admin.id, { lots: "0.3", maxPositions: "2", slAtr: "1", tpAtr: "2" });
    expect(await saveGateConfig(admin.id, { preset: "CAREFUL" })).toEqual({});
    const c = (await getLive(admin.id)).config;
    expect(c).toMatchObject({ lots: 0.3, gate: { on: true, minAgree: 10, maxTradesDay: 3, riskMode: "PCT", riskValue: 1, siteStops: true, protect: true, sessionStartUb: 15 } });
    await runAs(admin.id, "DAY");
    expect(await handleSync(token, report(), now)).toMatchObject({ cMin: 10, rMode: 2, rVal: 1, sMode: 1, protect: true });
  });
  test("the notices name the side, the price and the result in the owner's language", async () => {
    const { tradeOpenedText, tradeClosedText } = await import("@/lib/bot/liveDb");
    expect(tradeOpenedText({ locale: "en" }, { side: "BUY", lots: 0.01, openPrice: 4100.5, cBuy: 11, cSell: 2, cTotal: 16 })).toContain("11 of 16 methods backed this side");
    expect(tradeClosedText({ locale: "en" }, { side: "SELL", lots: 0.01, openPrice: 4100, closePrice: 4096.5, profit: 3.5 })).toMatch(/closed a trade.*\+\$3\.50[\s\S]*4100\.00 → 4096\.50/);
    expect(tradeClosedText({ locale: "mn" }, { side: "BUY", lots: 0.01, openPrice: 4100, closePrice: 4098, profit: -2 })).toContain("−$2.00");
  });
});

describe("the Bot page: Setup signals only, with one risk setting", () => {
  test("saving the risk as % of balance moves the bot to the Setup signals and keeps every other setting", async () => {
    await saveLiveConfig(admin.id, { mode: "BASKET", bLots: "0.02", bCount: "8", bProfit: "6", bLoss: "15" });
    await saveGateConfig(admin.id, { preset: "CAREFUL" });
    const before = (await getLive(admin.id)).config;
    expect(await saveSimpleConfig(admin.id, { sizing: "PCT", pct: "2.5", allowReal: "on" })).toEqual({});
    const c = (await getLive(admin.id)).config;
    expect(c).toMatchObject({ mode: "ASIAN", allowReal: true, basket: before.basket, rule: before.rule, gate: { ...before.gate, riskMode: "PCT", riskValue: 2.5 } });
    await startBot(admin.id, now);
    expect(await handleSync(token, report(), now)).toMatchObject({ state: "RUNNING", mode: "ASIAN", rMode: 2, rVal: 2.5, gateOn: false, cMin: 0 });
  });
  test("a fixed lot is saved as the rule's lot with no risk amount; the real-account switch goes off when unticked", async () => {
    await saveSimpleConfig(admin.id, { sizing: "PCT", pct: "1", allowReal: "on" });
    expect(await saveSimpleConfig(admin.id, { sizing: "LOTS", lots: "0.07" })).toEqual({});
    expect((await getLive(admin.id)).config).toMatchObject({ mode: "ASIAN", allowReal: false, rule: { lots: 0.07 }, gate: { riskMode: "LOTS", riskValue: 0 } });
    await startBot(admin.id, now);
    expect(await handleSync(token, report(), now)).toMatchObject({ mode: "ASIAN", lots: 0.07, rMode: 0, rVal: 0 });
  });
  test("values outside the allowed range are refused in the viewer's language and nothing is saved", async () => {
    const { enT } = await import("@/lib/i18n");
    const before = (await getLive(admin.id)).config;
    for (const bad of [{ sizing: "PCT", pct: "0.05" }, { sizing: "PCT", pct: "6" }, { sizing: "PCT", pct: "" }, { sizing: "LOTS", lots: "0" }, { sizing: "LOTS", lots: "abc" }, { sizing: "USD", pct: "1" }, {}]) {
      expect((await saveSimpleConfig(admin.id, bad)).error, JSON.stringify(bad)).toBeTruthy();
    }
    expect((await saveSimpleConfig(admin.id, { sizing: "PCT", pct: "9" }, enT)).error).toBe("Risk must be 0.1–5% of balance");
    expect((await saveSimpleConfig(admin.id, { sizing: "LOTS", lots: "0" }, enT)).error).toBe("Lots must be 0.01–100");
    expect((await saveSimpleConfig(admin.id, {}, enT)).error).toBe("Choose how to size a trade");
    expect((await saveSimpleConfig(admin.id, { sizing: "PCT", pct: "9" })).error).toMatch(/балансын/);
    expect((await getLive(admin.id)).config).toEqual(before);
  });
  test("Start always runs the Setup signals, whatever tool the bot was saved on", async () => {
    for (const mode of ["DAY", "READING", "BASKET", "SCALPER"] as const) {
      await stopBot(admin.id, "MANUAL", now);
      await saveGateConfig(admin.id, { preset: "BALANCED" });
      await setMode(admin.id, mode);
      await startBot(admin.id, now);
      const c = (await getLive(admin.id)).config;
      expect(c.mode, mode).toBe("ASIAN");
      expect(c.gate).toMatchObject({ minAgree: 9, riskMode: "PCT", riskValue: 2 }); // the rest is kept
      expect(await handleSync(token, report(), now)).toMatchObject({ state: "RUNNING", mode: "ASIAN" });
    }
  });
  test("a robot file older than the Setup signals need is told to stop, with the reason the page shows", async () => {
    await startBot(admin.id, now);
    expect(await handleSync(token, report({ version: 12 }), now)).toMatchObject({ state: "STOPPED", reason: "OLD_ROBOT" });
  });
});
