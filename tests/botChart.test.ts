import { describe, it, expect, beforeEach } from "vitest";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { botChartData } from "@/lib/botChart";

beforeEach(async () => { await resetDb(); });

describe("botChartData", () => {
  it("closed trades newest first, with the entry time when the robot recorded it, and the open positions", async () => {
    const u = await makeUser("a@x.mn");
    const pos = { ticket: "9", side: "SELL", lots: 0.02, openPrice: 2650, sl: 2660, tp: 2630, profit: -3.2 };
    await db.insert(schema.botLive).values({ userId: u.id, login: "111", state: "RUNNING", config: {}, status: { positions: [pos] } });
    await db.insert(schema.botEntries).values({ userId: u.id, login: "111", ticket: "p1", side: "BUY", openedAt: new Date("2026-11-26T01:00:00Z"), openPrice: 2600, lots: 0.01, cBuy: 0, cSell: 0, cTotal: 0, session: "ASIA" });
    const d = { userId: u.id, login: "111", lots: 0.01 };
    await db.insert(schema.botDeals).values([
      { ...d, ticket: "d1", side: "BUY", openPrice: 2600, closePrice: 2612.5, profit: 12.5, closeTime: new Date("2026-11-26T02:00:00Z"), position: "p1" },
      { ...d, ticket: "d2", side: "SELL", openPrice: 2620, closePrice: 2624, profit: -4, closeTime: new Date("2026-11-26T05:00:00Z") },
      { ...d, login: "222", ticket: "d3", side: "BUY", openPrice: 1, closePrice: 2, profit: 1, closeTime: new Date("2026-11-26T06:00:00Z") },
    ]);
    const r = await botChartData(u.id, "111");
    expect(r.trades.map((t) => [t.ticket, t.side, t.profit, t.openedAt])).toEqual([
      ["d2", "SELL", -4, null],
      ["d1", "BUY", 12.5, "2026-11-26T01:00:00.000Z"],
    ]);
    expect(r.trades[1]).toMatchObject({ openPrice: 2600, closePrice: 2612.5, closedAt: "2026-11-26T02:00:00.000Z", lots: 0.01 });
    expect(r.open).toEqual([pos]);
  });
  it("is empty for an account that is not yours", async () => {
    const a = await makeUser("a@x.mn"), b = await makeUser("b@x.mn");
    await db.insert(schema.botDeals).values({ userId: a.id, login: "111", ticket: "d1", side: "BUY", lots: 0.01, openPrice: 1, closePrice: 2, profit: 1, closeTime: new Date() });
    expect(await botChartData(b.id, "111")).toEqual({ trades: [], open: [] });
  });
});
