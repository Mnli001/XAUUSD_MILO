import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/users";
import { createUser, findUserByEmail } from "@/lib/users";
import { saveTrade, listTrades } from "@/lib/trades";
import { getLive } from "@/lib/bot/liveDb";
import { deleteAccount, saveSignalPrefs, wantsSignal } from "@/lib/account";
import { tradesCsv } from "@/lib/export";
import { viewer } from "@/lib/viewer";

const withPassword = async (email: string, role: "USER" | "ADMIN" = "USER") => {
  await createUser({ name: "Бат", email, password: "password123" }, role);
  return (await findUserByEmail(email))!;
};

describe("deleting an account", () => {
  beforeEach(resetDb);

  it("needs the right password", async () => {
    const u = await withPassword("a@x.mn");
    expect((await deleteAccount(u.id, "wrong-password")).error).toBe("password");
    expect(await findUserByEmail("a@x.mn")).not.toBeNull();
  });
  it("removes the user together with their journal and bot", async () => {
    const u = await withPassword("a@x.mn");
    await saveTrade(u.id, null, { direction: "BUY", lots: "0.1", entryPrice: "4000", openedAt: "2026-11-20T02:00:00Z" });
    await getLive(u.id); // creates the user's bot row
    expect(await listTrades(u.id)).toHaveLength(1);
    expect(await deleteAccount(u.id, "password123")).toEqual({});
    expect(await findUserByEmail("a@x.mn")).toBeNull();
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM trades`)).rows[0].n).toBe(0);
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM bot_live`)).rows[0].n).toBe(0);
  });
  it("refuses to delete an admin", async () => {
    const admin = await withPassword("adm@x.mn", "ADMIN");
    expect((await deleteAccount(admin.id, "password123")).error).toBe("admin");
    expect(await findUserByEmail("adm@x.mn")).not.toBeNull();
  });
});

describe("Telegram signal choices", () => {
  beforeEach(resetDb);

  it("everything is wanted until the user says otherwise", async () => {
    const u = await makeUser("a@x.mn");
    expect(wantsSignal(u, "asian-breakout")).toBe(true);
    expect(wantsSignal(u, "trend-dip")).toBe(true);
  });
  it("a muted setup is not wanted, the other still is", async () => {
    const u = await makeUser("a@x.mn");
    expect(await saveSignalPrefs(u.id, { paused: false, wanted: ["asian-breakout"] })).toEqual({});
    const saved = (await findUserByEmail("a@x.mn"))!;
    expect(wantsSignal(saved, "asian-breakout")).toBe(true);
    expect(wantsSignal(saved, "trend-dip")).toBe(false);
  });
  it("pausing stops every setup without unlinking", async () => {
    const u = await makeUser("a@x.mn");
    await saveSignalPrefs(u.id, { paused: true, wanted: ["asian-breakout", "trend-dip"] });
    const saved = (await findUserByEmail("a@x.mn"))!;
    expect(wantsSignal(saved, "asian-breakout")).toBe(false);
    expect(saved.signalsMuted).toBe("");
  });
  it("refuses a setup it does not know", async () => {
    const u = await makeUser("a@x.mn");
    expect((await saveSignalPrefs(u.id, { paused: false, wanted: ["moon-phase"] })).error).toBe("setup");
  });
});

describe("journal export", () => {
  const trade = { id: "t1", userId: "u", symbol: "XAUUSD", direction: "BUY" as const, lots: 0.1, entryPrice: 4000, exitPrice: 4010, stopLoss: 3995, takeProfit: 4010, openedAt: new Date(Date.UTC(2026, 10, 20, 2, 0)), closedAt: new Date(Date.UTC(2026, 10, 20, 5, 30)), note: 'Лондон нээлт, "breakout"', imageMime: null };

  it("writes one row per trade with profit and R, times in the viewer's zone", () => {
    const csv = tradesCsv([trade], viewer({ locale: "en", timeZone: "Europe/London" }));
    const [head, row] = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(head).toBe("Opened (London),Closed (London),Symbol,Side,Lots,Entry,Exit,Stop loss,Take profit,Profit $,R,Note");
    expect(row).toBe('2026-11-20 02:00,2026-11-20 05:30,XAUUSD,BUY,0.1,4000,4010,3995,4010,100.00,2.00,"Лондон нээлт, ""breakout"""');
  });
  it("uses Mongolian headings and Ulaanbaatar time by default, and starts with a BOM so Excel reads it", () => {
    const csv = tradesCsv([{ ...trade, exitPrice: null, closedAt: null, note: null }], viewer({ locale: "mn", timeZone: "Asia/Ulaanbaatar" }));
    expect(csv.startsWith("﻿")).toBe(true);
    const [head, row] = csv.slice(1).trim().split("\r\n");
    expect(head).toBe("Нээсэн (УБ),Хаасан (УБ),Хэрэгсэл,Чиглэл,Лот,Орсон үнэ,Гарсан үнэ,Stop loss,Take profit,Ашиг $,R,Тэмдэглэл");
    expect(row).toBe("2026-11-20 10:00,,XAUUSD,BUY,0.1,4000,,3995,4010,,,");
  });
  it("keeps a note that starts like a formula from running in a spreadsheet", () => {
    const csv = tradesCsv([{ ...trade, note: "=HYPERLINK(1)" }], viewer({ locale: "en", timeZone: "UTC" }));
    expect(csv).toContain(",'=HYPERLINK(1)");
  });
});
