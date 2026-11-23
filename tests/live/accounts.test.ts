import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getLive, saveLiveConfig, startBot, stopBot, rotateToken, handleSync, getLiveView, listAccounts } from "@/lib/bot/liveDb";
import type { User } from "@/lib/db/schema";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/users";

let user: User, token: string;
const now = new Date("2026-11-23T10:00:00Z");
const later = (s: number) => new Date(now.getTime() + s * 1000);
const report = (login: string, server: string | undefined, o: Record<string, unknown> = {}) => ({
  account: { login, mode: "DEMO", balance: login === "969508" ? 5000 : 100000, equity: 100000, currency: "USD", ...(server ? { server } : {}) },
  symbol: "XAUUSD", bid: 4100.1, ask: 4100.4, signal: "NONE", reason: "", runPnl: 0, version: 5,
  positions: [], deals: [], finished: "", ...o,
});
const MQ = ["5058238423", "MetaQuotes-Demo"] as const;
const MOT = ["969508", "MOTCapital-Demo-1"] as const;

beforeEach(async () => {
  await resetDb();
  user = await makeUser("u@x.mn");
  await db.execute(sql`UPDATE users SET access_until = ${new Date("2027-06-01T00:00:00Z")} WHERE id = ${user.id}`);
  token = await rotateToken(user.id);
});

test("the first account to connect keeps the settings and state made before it connected", async () => {
  await saveLiveConfig(user.id, { lots: "0.2", maxPositions: "2", slAtr: "1", tpAtr: "1" });
  await startBot(user.id, now);
  expect(await handleSync(token, report(...MQ), now)).toMatchObject({ state: "RUNNING", lots: 0.2 });
  expect((await listAccounts(user.id, now)).map((a) => a.login)).toEqual([MQ[0]]);
});

test("a second account appears on its own, stopped, with default settings; the first keeps running", async () => {
  await startBot(user.id, now);
  await handleSync(token, report(...MQ), now);
  expect(await handleSync(token, report(...MOT), later(5))).toMatchObject({ state: "STOPPED", lots: 0.01 });
  const accounts = await listAccounts(user.id, later(6));
  expect(accounts.map((a) => [a.login, a.server, a.state, a.online])).toEqual([
    [MOT[0], MOT[1], "STOPPED", true], // most recently seen first
    [MQ[0], MQ[1], "RUNNING", true],
  ]);
  expect(accounts[0].label).toBe("MOTCapital-Demo-1 · ••••9508");
  expect((await getLive(user.id, MQ[0])).state).toBe("RUNNING");
});

test("each account has its own settings, start/stop and view", async () => {
  await handleSync(token, report(...MQ), now);
  await handleSync(token, report(...MOT), now);
  await saveLiveConfig(user.id, { mode: "BASKET", bLots: "0.01", bCount: "5", bProfit: "5", bLoss: "10" }, undefined, MOT[0]);
  await startBot(user.id, now, MOT[0]);
  expect(await handleSync(token, report(...MOT), later(1))).toMatchObject({ state: "RUNNING", mode: "BASKET", maxPositions: 5 });
  expect(await handleSync(token, report(...MQ), later(1))).toMatchObject({ state: "STOPPED", mode: "SCALPER" });
  expect(await getLiveView(user.id, later(2), MOT[0])).toMatchObject({ account: MOT[0], state: "RUNNING", balance: 5000, accountServer: MOT[1] });
  expect(await getLiveView(user.id, later(2), MQ[0])).toMatchObject({ account: MQ[0], state: "STOPPED", balance: 100000 });
  await stopBot(user.id, "MANUAL", later(3), MOT[0]);
  expect((await getLive(user.id, MOT[0])).state).toBe("STOPPED");
});

test("without a chosen account the page shows the one seen last; an unknown account falls back to it", async () => {
  await handleSync(token, report(...MQ), now);
  await handleSync(token, report(...MOT), later(1));
  expect((await getLiveView(user.id, later(2))).account).toBe(MOT[0]);
  expect((await getLiveView(user.id, later(2), "someone-elses")).account).toBe(MOT[0]);
  await handleSync(token, report(...MQ), later(3));
  expect((await getLiveView(user.id, later(4))).account).toBe(MQ[0]);
  expect((await getLiveView(user.id, later(4))).accounts).toHaveLength(2);
});

test("deals are kept per account, so the same ticket in two accounts is two deals", async () => {
  const deal = (profit: number) => ({ ticket: "77", side: "BUY", lots: 0.01, openPrice: 1, closePrice: 2, profit, closeTime: "2026-11-23T09:59:00Z" });
  await handleSync(token, report(...MQ, { deals: [deal(3)] }), now);
  await handleSync(token, report(...MOT, { deals: [deal(-2)] }), now);
  expect(await getLiveView(user.id, now, MQ[0])).toMatchObject({ dealCount: 1, pnl24h: 3 });
  expect(await getLiveView(user.id, now, MOT[0])).toMatchObject({ dealCount: 1, pnl24h: -2 });
});

test("an account with no server name (robot older than v2.41) is still listed", async () => {
  await handleSync(token, report("31234567", undefined, { version: 4 }), now);
  const [a] = await listAccounts(user.id, now);
  expect(a).toMatchObject({ login: "31234567", server: null, label: "••••4567" });
});

test("one token serves every account; rotating it cuts them all off", async () => {
  await handleSync(token, report(...MQ), now);
  await handleSync(token, report(...MOT), now);
  const old = token;
  token = await rotateToken(user.id);
  expect(await handleSync(old, report(...MOT), later(1))).toBeNull();
  expect(await handleSync(token, report(...MOT), later(1))).not.toBeNull();
  expect(await listAccounts(user.id, later(1))).toHaveLength(2);
});
