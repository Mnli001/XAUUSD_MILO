import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { MANUAL_LOGIN, addManualTrade, deleteManualTrade, getManualTrade, journalLogins, listJournal, storeJournal, updateManualTrade } from "@/lib/journal";
import { manualProfit, parseManualTrade, type ManualTrade } from "@/lib/journalForm";
import { journalStats } from "@/lib/journalStats";
import { enT, mnT } from "@/lib/i18n";
import { viewer } from "@/lib/viewer";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ side: "BUY", date: "2026-11-20", openAt: "09:15", closeAt: "11:45", openPrice: "4000", closePrice: "4012.5", lots: "0.10", stopLoss: "", note: "", ...o })) f.set(k, v);
  return f;
};
const NOW = new Date("2026-11-27T00:00:00Z");
const UB = "Asia/Ulaanbaatar";

describe("writing a trade by hand: the form", () => {
  it("turns the reader's wall clock into instants and works out the side", () => {
    const r = parseManualTrade(form({}), UB, NOW, mnT);
    expect("trade" in r && r.trade).toMatchObject({ side: "BUY", lots: 0.1, openPrice: 4000, closePrice: 4012.5, stopLoss: null, note: null });
    if (!("trade" in r)) throw new Error("no trade");
    expect(r.trade.openTime.toISOString()).toBe("2026-11-20T01:15:00.000Z"); // 09:15 Ulaanbaatar
    expect(r.trade.closeTime.toISOString()).toBe("2026-11-20T03:45:00.000Z");
  });
  it("a close earlier than the open is the next day; no close time means closed when opened", () => {
    const r = parseManualTrade(form({ openAt: "23:30", closeAt: "01:10" }), UB, NOW, mnT);
    if (!("trade" in r)) throw new Error("no trade");
    expect(r.trade.closeTime.getTime() - r.trade.openTime.getTime()).toBe(100 * 6e4);
    const same = parseManualTrade(form({ closeAt: "" }), UB, NOW, mnT);
    if (!("trade" in same)) throw new Error("no trade");
    expect(same.trade.closeTime.getTime()).toBe(same.trade.openTime.getTime());
  });
  it("refuses a missing side, bad prices, lots out of range, a future close and a long note, in the reader's language", () => {
    expect(parseManualTrade(form({ side: "" }), UB, NOW, mnT)).toEqual({ error: "BUY эсвэл SELL сонгоно уу." });
    expect(parseManualTrade(form({ openPrice: "abc" }), UB, NOW, enT)).toEqual({ error: "Enter valid entry and exit prices." });
    expect(parseManualTrade(form({ lots: "0" }), UB, NOW, enT)).toHaveProperty("error");
    expect(parseManualTrade(form({ lots: "500" }), UB, NOW, enT)).toHaveProperty("error");
    expect(parseManualTrade(form({ date: "2026-12-30" }), UB, NOW, enT)).toHaveProperty("error");
    expect(parseManualTrade(form({ note: "x".repeat(501) }), UB, NOW, enT)).toHaveProperty("error");
    expect(parseManualTrade(form({ stopLoss: "-5" }), UB, NOW, enT)).toHaveProperty("error");
  });
  it("takes a decimal comma and keeps the optional stop and note", () => {
    const r = parseManualTrade(form({ openPrice: "4000,5", stopLoss: "3990", note: "  NY нээлт  " }), UB, NOW, mnT);
    if (!("trade" in r)) throw new Error("no trade");
    expect(r.trade).toMatchObject({ openPrice: 4000.5, stopLoss: 3990, note: "NY нээлт" });
  });
  it("P/L = (exit − entry) × side × lots × 100 oz", () => {
    expect(manualProfit({ side: "BUY", lots: 0.1, openPrice: 4000, closePrice: 4012.5 })).toBe(125);
    expect(manualProfit({ side: "SELL", lots: 0.05, openPrice: 4000, closePrice: 4010 })).toBe(-50);
  });
});

describe("writing a trade by hand: storage", () => {
  beforeEach(resetDb);
  const t: ManualTrade = { side: "SELL", lots: 0.2, openPrice: 4050, closePrice: 4040, openTime: new Date("2026-11-20T01:00:00Z"), closeTime: new Date("2026-11-20T02:00:00Z"), stopLoss: 4060, note: "London" };

  it("is kept per user, joins the same journal and stats as the MT5 trades, and is never an MT5 account", async () => {
    const u = await makeUser("w@x.mn"), other = await makeUser("o@x.mn");
    const ticket = await addManualTrade(u.id, t);
    const deal = { ticket: "1", symbol: "XAUUSD", side: "BUY" as const, lots: 0.1, openPrice: 4000, closePrice: 4010, openTime: new Date("2026-11-21T01:00:00Z"), closeTime: new Date("2026-11-21T02:00:00Z"), profit: 100, magic: "0" };
    await storeJournal(u.id, "5001", [deal]);
    expect(await storeJournal(u.id, MANUAL_LOGIN, [deal])).toBe(0); // a robot cannot file under the written trades' login
    const all = await listJournal(u.id, { source: "all" });
    expect(all).toHaveLength(2);
    const mine = all.find((r) => r.source === "web")!;
    expect(mine).toMatchObject({ ticket, login: MANUAL_LOGIN, profit: 200, stopLoss: 4060, note: "London", magic: "0" });
    expect(await listJournal(u.id, { source: "manual" })).toHaveLength(2); // both placed by hand
    expect(await listJournal(u.id, { source: "all", origins: ["web"] })).toHaveLength(1); // without a plan
    expect(await listJournal(other.id, { source: "all" })).toHaveLength(0);
    expect(await journalLogins(u.id)).toEqual(["5001"]);
    expect(journalStats(all, viewer({ locale: "en", timeZone: UB })).totals).toMatchObject({ trades: 2, net: 300 });
  });

  it("can be edited and deleted by its owner only; MT5 rows cannot", async () => {
    const u = await makeUser("e@x.mn"), other = await makeUser("p@x.mn");
    const ticket = await addManualTrade(u.id, t);
    expect(await updateManualTrade(other.id, ticket, { ...t, closePrice: 4000 })).toBe(false);
    expect(await updateManualTrade(u.id, ticket, { ...t, closePrice: 4070, note: null })).toBe(true);
    expect(await getManualTrade(u.id, ticket)).toMatchObject({ closePrice: 4070, profit: -400, note: null });
    await storeJournal(u.id, "5001", [{ ticket: "9", symbol: "XAUUSD", side: "BUY", lots: 0.1, openPrice: 1, closePrice: 2, openTime: t.openTime, closeTime: t.closeTime, profit: 10, magic: "7" }]);
    expect(await deleteManualTrade(u.id, "9")).toBe(false);
    expect(await deleteManualTrade(other.id, ticket)).toBe(false);
    expect(await deleteManualTrade(u.id, ticket)).toBe(true);
    expect(await listJournal(u.id, { source: "all" })).toHaveLength(1);
  });
});

describe("the analysis of written trades", () => {
  it("leaves trades with no closing time out of the time held", () => {
    const base = { symbol: "XAUUSD", side: "BUY", lots: 0.1, openPrice: 1, closePrice: 2, magic: "0", source: "web" };
    const at = new Date("2026-11-02T08:00:00Z");
    const s = journalStats([
      { ...base, openTime: at, closeTime: at, profit: 10 },
      { ...base, openTime: at, closeTime: new Date(at.getTime() + 30 * 6e4), profit: 20 },
    ], viewer({ locale: "en", timeZone: UB }));
    expect(s.behaviour.holdWin).toBe(30);
  });
});
