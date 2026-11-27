import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import {
  MAX_DEMO_ACCOUNTS, openDemoAccount, listDemoAccounts, placeDemoOrder, modifyDemoOrder, closeDemoPosition, cancelDemoOrder,
  closeAllDemo, adjustDemoBalance, processDemoTick, demoState, deleteDemoAccount, demoMissions,
} from "@/lib/demo/demo";

const now = new Date("2026-11-27T08:00:00Z");
const at = (s: number) => new Date(now.getTime() + s * 1000);
const px = (bid: number, spread = 0.3) => ({ bid, ask: Math.round((bid + spread) * 100) / 100 });

async function setup(balance = 10_000, leverage = 100) {
  const u = await makeUser(`d${Math.random()}@x.mn`);
  const r = await openDemoAccount(u.id, { name: "Миний demo", balance, leverage, beginner: true }, now);
  return { u, acct: r.account! };
}

describe("accounts", () => {
  beforeEach(resetDb);
  it("opens with a name, money and leverage of the member's choosing", async () => {
    const { u, acct } = await setup(2500, 500);
    expect(acct).toMatchObject({ name: "Миний demo", balance: 2500, startBalance: 2500, leverage: 500 });
    expect((await listDemoAccounts(u.id)).map((a) => a.id)).toEqual([acct.id]);
  });
  it("refuses an empty name, silly money, other leverage, and a fourth account", async () => {
    const u = await makeUser("e@x.mn");
    expect((await openDemoAccount(u.id, { name: " ", balance: 1000, leverage: 100, beginner: false }, now)).error).toBe("name");
    expect((await openDemoAccount(u.id, { name: "a", balance: 5, leverage: 100, beginner: false }, now)).error).toBe("balance");
    expect((await openDemoAccount(u.id, { name: "a", balance: 1000, leverage: 77, beginner: false }, now)).error).toBe("leverage");
    for (let i = 0; i < MAX_DEMO_ACCOUNTS; i++) await openDemoAccount(u.id, { name: `a${i}`, balance: 1000, leverage: 100, beginner: false }, now);
    expect((await openDemoAccount(u.id, { name: "x", balance: 1000, leverage: 100, beginner: false }, now)).error).toBe("max");
  });
  it("another member's account is out of reach", async () => {
    const { acct } = await setup();
    const other = await makeUser("o@x.mn");
    expect((await placeDemoOrder(other.id, acct.id, { side: "BUY", type: "MARKET", lots: 0.1 }, px(4000), now)).error).toBe("account");
    expect(await deleteDemoAccount(other.id, acct.id)).toBe(false);
  });
});

describe("trading", () => {
  beforeEach(resetDb);
  it("a market buy fills at the ask; closing at the bid books the result to the balance", async () => {
    const { u, acct } = await setup();
    const o = (await placeDemoOrder(u.id, acct.id, { side: "BUY", type: "MARKET", lots: 0.5, sl: 3990, tp: 4020, note: "trend" }, px(4000), now)).order!;
    expect(o).toMatchObject({ status: "OPEN", openPrice: 4000.3, sl: 3990, tp: 4020, note: "trend" });
    const c = await closeDemoPosition(u.id, o.id, px(4010), at(60));
    expect(c.closed).toMatchObject({ status: "CLOSED", closePrice: 4010, profit: 485, closeReason: "MANUAL" });
    const s = await demoState(u.id, acct.id, px(4010));
    expect(s!.account.balance).toBe(10_485);
    expect(s!.history).toHaveLength(1);
    expect(s!.positions).toHaveLength(0);
  });
  it("a partial close keeps the rest open", async () => {
    const { u, acct } = await setup();
    const o = (await placeDemoOrder(u.id, acct.id, { side: "SELL", type: "MARKET", lots: 1 }, px(4000), now)).order!;
    const c = await closeDemoPosition(u.id, o.id, px(3990, 0.3), at(30), 0.4);
    expect(c.closed).toMatchObject({ lots: 0.4, profit: 388 }); // (4000 − 3990.3) × 40
    const s = (await demoState(u.id, acct.id, px(3990)))!;
    expect(s.positions[0]).toMatchObject({ id: o.id, lots: 0.6 });
    expect(s.account.balance).toBe(10_388);
    expect((await closeDemoPosition(u.id, o.id, px(3990), at(31), 0.7)).error).toBe("lots");
  });
  it("orders the account cannot pay for, or with the stop on the wrong side, are refused", async () => {
    const { u, acct } = await setup(1000);
    expect((await placeDemoOrder(u.id, acct.id, { side: "BUY", type: "MARKET", lots: 1 }, px(4000), now)).error).toBe("margin");
    expect((await placeDemoOrder(u.id, acct.id, { side: "BUY", type: "MARKET", lots: 0.01, sl: 4001 }, px(4000), now)).error).toBe("sl");
    expect((await placeDemoOrder(u.id, acct.id, { side: "BUY", type: "MARKET", lots: 0.01 }, null, now)).error).toBe("closed");
  });
  it("moving the stop: to breakeven is fine, past the price is not", async () => {
    const { u, acct } = await setup();
    const o = (await placeDemoOrder(u.id, acct.id, { side: "BUY", type: "MARKET", lots: 0.1, sl: 3990 }, px(4000), now)).order!;
    expect((await modifyDemoOrder(u.id, o.id, { sl: 4000.3, tp: 4030 }, px(4005))).order).toMatchObject({ sl: 4000.3, tp: 4030 });
    expect((await modifyDemoOrder(u.id, o.id, { sl: 4006, tp: null }, px(4005))).error).toBe("sl");
  });
});

describe("the price does the rest", () => {
  beforeEach(resetDb);
  it("a buy limit waits, fills when the ask comes down to it, then its target closes it", async () => {
    const { u, acct } = await setup();
    const o = (await placeDemoOrder(u.id, acct.id, { side: "BUY", type: "LIMIT", lots: 0.2, price: 3995, sl: 3985, tp: 4005 }, px(4000), now)).order!;
    expect(o.status).toBe("PENDING");
    await processDemoTick(px(3997), at(1));
    expect((await demoState(u.id, acct.id, px(3997)))!.pending).toHaveLength(1);
    await processDemoTick(px(3994.5), at(2)); // ask 3994.8
    let s = (await demoState(u.id, acct.id, px(3994.5)))!;
    expect(s.positions[0]).toMatchObject({ id: o.id, status: "OPEN", openPrice: 3994.8 });
    await processDemoTick(px(4005.2), at(3));
    s = (await demoState(u.id, acct.id, px(4005.2)))!;
    expect(s.history[0]).toMatchObject({ closeReason: "TP", closePrice: 4005.2, profit: 208 });
  });
  it("a sell's stop is hit at the ask", async () => {
    const { u, acct } = await setup();
    await placeDemoOrder(u.id, acct.id, { side: "SELL", type: "MARKET", lots: 0.1, sl: 4005 }, px(4000), now);
    await processDemoTick(px(4004.6), at(1)); // ask 4004.9: not yet
    expect((await demoState(u.id, acct.id, px(4004.6)))!.positions).toHaveLength(1);
    await processDemoTick(px(4004.8), at(2)); // ask 4005.1
    expect((await demoState(u.id, acct.id, px(4004.8)))!.history[0]).toMatchObject({ closeReason: "SL", profit: -51 });
  });
  it("a stop-out closes the worst position when the margin level falls under 50%", async () => {
    const { u, acct } = await setup(1000, 500);
    await placeDemoOrder(u.id, acct.id, { side: "BUY", type: "MARKET", lots: 1 }, px(4000), now); // margin 800.06
    await processDemoTick(px(3994), at(1)); // −630: equity 370, 46%
    const s = (await demoState(u.id, acct.id, px(3994)))!;
    expect(s.positions).toHaveLength(0);
    expect(s.history[0]).toMatchObject({ closeReason: "STOPOUT", profit: -630 });
    expect(s.account.balance).toBe(370);
  });
  it("a position closed by hand and by its stop at the same moment is booked once", async () => {
    const { u, acct } = await setup();
    const o = (await placeDemoOrder(u.id, acct.id, { side: "BUY", type: "MARKET", lots: 0.1, sl: 3999 }, px(4000), now)).order!;
    await Promise.all([processDemoTick(px(3998), at(1)), closeDemoPosition(u.id, o.id, px(3998), at(1))]);
    const s = (await demoState(u.id, acct.id, px(3998)))!;
    expect(s.history).toHaveLength(1);
    expect(s.account.balance).toBe(10_000 - 23);
  });
});

describe("the money", () => {
  beforeEach(resetDb);
  it("deposit, withdraw (not past the free margin), and start over", async () => {
    const { u, acct } = await setup(1000);
    expect((await adjustDemoBalance(u.id, acct.id, "DEPOSIT", 500, px(4000), now)).account!.balance).toBe(1500);
    await placeDemoOrder(u.id, acct.id, { side: "BUY", type: "MARKET", lots: 0.3 }, px(4000), now); // margin 1200.09
    expect((await adjustDemoBalance(u.id, acct.id, "WITHDRAW", 400, px(4000), now)).error).toBe("free");
    expect((await adjustDemoBalance(u.id, acct.id, "WITHDRAW", 200, px(4000.3), now)).account!.balance).toBe(1300);
    const r = (await adjustDemoBalance(u.id, acct.id, "RESET", 25_000, px(4000), now)).account!;
    expect(r).toMatchObject({ balance: 25_000, startBalance: 25_000 });
    const s = (await demoState(u.id, acct.id, px(4000)))!;
    expect(s.positions).toHaveLength(0);
    expect(s.history).toHaveLength(0);
  });
  it("close all and cancel", async () => {
    const { u, acct } = await setup();
    await placeDemoOrder(u.id, acct.id, { side: "BUY", type: "MARKET", lots: 0.1 }, px(4000), now);
    await placeDemoOrder(u.id, acct.id, { side: "SELL", type: "MARKET", lots: 0.1 }, px(4000), now);
    const p = (await placeDemoOrder(u.id, acct.id, { side: "SELL", type: "LIMIT", lots: 0.1, price: 4010 }, px(4000), now)).order!;
    expect(await cancelDemoOrder(u.id, p.id)).toBe(true);
    expect(await closeAllDemo(u.id, acct.id, px(4000), at(5))).toBe(2);
    const s = (await demoState(u.id, acct.id, px(4000)))!;
    expect(s.positions).toHaveLength(0);
    expect(s.pending).toHaveLength(0);
    expect(s.account.balance).toBe(10_000 - 6); // the spread, twice: $3 a 0.10 lot
  });
});

describe("the beginner's steps", () => {
  beforeEach(resetDb);
  it("count what was done: a stop, a pending order, a target, breakeven, a partial close", async () => {
    const { u, acct } = await setup();
    const m = await placeDemoOrder(u.id, acct.id, { side: "BUY", type: "MARKET", lots: 0.2, sl: 3990, tp: 4010, note: "pullback to EMA" }, px(4000), now);
    await placeDemoOrder(u.id, acct.id, { side: "SELL", type: "LIMIT", lots: 0.1, price: 4020 }, px(4000), now);
    await modifyDemoOrder(u.id, m.order!.id, { sl: 4000.3, tp: 4010 }, px(4005));
    await closeDemoPosition(u.id, m.order!.id, px(4006), at(5), 0.1);
    await processDemoTick(px(4010), at(6));
    const got = Object.fromEntries((await demoMissions(acct.id, 10_000)).map((x) => [x.id, x.count]));
    expect(got).toEqual({ sl: 1, pending: 1, tp: 1, breakeven: 1, partial: 1, notes: 1, smallRisk: 1 });
  });
});
