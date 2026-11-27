import { describe, expect, it } from "vitest";
import {
  CONTRACT, pnl, marginFor, openPriceFor, closePriceFor, pendingTriggered, exitHit, accountState, validateOrder, stopOutVictims, riskLots, roundLots,
} from "@/lib/demo/engine";

const tick = { bid: 4000, ask: 4000.3 };

describe("prices and money", () => {
  it("buys at the ask, sells at the bid, and closes the other way", () => {
    expect(openPriceFor("BUY", tick)).toBe(4000.3);
    expect(openPriceFor("SELL", tick)).toBe(4000);
    expect(closePriceFor("BUY", tick)).toBe(4000);
    expect(closePriceFor("SELL", tick)).toBe(4000.3);
  });
  it("a lot is 100 ounces: $1 move on 0.10 lot is $10", () => {
    expect(CONTRACT).toBe(100);
    expect(pnl("BUY", 0.1, 4000, 4001)).toBe(10);
    expect(pnl("SELL", 0.1, 4000, 4001)).toBe(-10);
    expect(pnl("SELL", 0.25, 4010.55, 4000.3)).toBe(256.25);
  });
  it("margin is the trade's value over the leverage", () => {
    expect(marginFor(1, 4000, 100)).toBe(4000);
    expect(marginFor(0.1, 4000, 500)).toBe(80);
  });
  it("lots snap to 0.01", () => {
    expect(roundLots(0.129)).toBe(0.12);
    expect(roundLots(0.005)).toBe(0);
  });
  it("risk-based size: 1% of $10,000 with a $5 stop is 0.20 lot", () => {
    expect(riskLots(10_000, 1, 4000, 3995)).toBe(0.2);
    expect(riskLots(10_000, 1, 4000, 4000)).toBe(0);
  });
});

describe("triggers", () => {
  it("pending orders fill when the price reaches them", () => {
    expect(pendingTriggered({ side: "BUY", type: "LIMIT", price: 4000.3 }, tick)).toBe(true);
    expect(pendingTriggered({ side: "BUY", type: "LIMIT", price: 4000.2 }, tick)).toBe(false);
    expect(pendingTriggered({ side: "BUY", type: "STOP", price: 4000.3 }, tick)).toBe(true);
    expect(pendingTriggered({ side: "BUY", type: "STOP", price: 4001 }, tick)).toBe(false);
    expect(pendingTriggered({ side: "SELL", type: "LIMIT", price: 4000 }, tick)).toBe(true);
    expect(pendingTriggered({ side: "SELL", type: "LIMIT", price: 4000.5 }, tick)).toBe(false);
    expect(pendingTriggered({ side: "SELL", type: "STOP", price: 4000 }, tick)).toBe(true);
    expect(pendingTriggered({ side: "SELL", type: "STOP", price: 3999 }, tick)).toBe(false);
  });
  it("stops and targets on the closing side of the spread", () => {
    expect(exitHit({ side: "BUY", sl: 4000, tp: null }, tick)).toBe("SL");
    expect(exitHit({ side: "BUY", sl: 3990, tp: 4000 }, tick)).toBe("TP");
    expect(exitHit({ side: "BUY", sl: 3990, tp: 4010 }, tick)).toBeNull();
    expect(exitHit({ side: "SELL", sl: 4000.3, tp: null }, tick)).toBe("SL");
    expect(exitHit({ side: "SELL", sl: 4010, tp: 4000.3 }, tick)).toBe("TP");
    expect(exitHit({ side: "SELL", sl: null, tp: null }, tick)).toBeNull();
  });
});

describe("the account", () => {
  it("equity, margin, free margin and margin level", () => {
    const s = accountState(1000, 100, [{ side: "BUY", lots: 0.1, openPrice: 3990 }], tick);
    expect(s.floating).toBe(100);
    expect(s.equity).toBe(1100);
    expect(s.margin).toBe(399); // at the price it was opened
    expect(s.free).toBe(701);
    expect(s.level).toBeCloseTo(275.69, 2);
    expect(accountState(1000, 100, [], tick).level).toBeNull();
    expect(accountState(1000, 100, [{ side: "BUY", lots: 0.1, openPrice: 3990 }], null).floating).toBe(0); // no price: nothing to mark
  });
  it("stop-out closes the worst position first, until the level is back above 50%", () => {
    const pos = [
      { id: "a", side: "BUY" as const, lots: 1, openPrice: 4030 }, // −3000
      { id: "b", side: "SELL" as const, lots: 0.5, openPrice: 3990 }, // −515
      { id: "c", side: "BUY" as const, lots: 0.1, openPrice: 3999 }, // +10
    ];
    expect(stopOutVictims(5000, 100, pos, tick)).toEqual(["a"]);
    expect(stopOutVictims(4000, 100, pos, tick)).toEqual(["a", "b"]);
    expect(stopOutVictims(3600, 100, pos, tick)).toEqual(["a", "b", "c"]);
    expect(stopOutVictims(100_000, 100, pos, tick)).toEqual([]);
  });
});

describe("checking an order", () => {
  const acct = { balance: 1000, leverage: 100, positions: [] };
  it("accepts a sound market order", () => {
    expect(validateOrder({ side: "BUY", type: "MARKET", lots: 0.1, sl: 3990, tp: 4020 }, tick, acct)).toBeNull();
  });
  it("needs a live price", () => {
    expect(validateOrder({ side: "BUY", type: "MARKET", lots: 0.1 }, null, acct)).toBe("closed");
  });
  it("lots within 0.01–50 in steps of 0.01", () => {
    expect(validateOrder({ side: "BUY", type: "MARKET", lots: 0 }, tick, acct)).toBe("lots");
    expect(validateOrder({ side: "BUY", type: "MARKET", lots: 51 }, tick, acct)).toBe("lots");
    expect(validateOrder({ side: "BUY", type: "MARKET", lots: 0.015 }, tick, acct)).toBe("lots");
  });
  it("stop below and target above a buy; the other way for a sell", () => {
    expect(validateOrder({ side: "BUY", type: "MARKET", lots: 0.1, sl: 4000.1 }, tick, acct)).toBe("sl");
    expect(validateOrder({ side: "BUY", type: "MARKET", lots: 0.1, tp: 3999 }, tick, acct)).toBe("tp");
    expect(validateOrder({ side: "SELL", type: "MARKET", lots: 0.1, sl: 4000.2 }, tick, acct)).toBe("sl");
    expect(validateOrder({ side: "SELL", type: "MARKET", lots: 0.1, tp: 4001 }, tick, acct)).toBe("tp");
  });
  it("pending prices on the right side: limits better than now, stops beyond", () => {
    expect(validateOrder({ side: "BUY", type: "LIMIT", lots: 0.1, price: 3995 }, tick, acct)).toBeNull();
    expect(validateOrder({ side: "BUY", type: "LIMIT", lots: 0.1, price: 4005 }, tick, acct)).toBe("price");
    expect(validateOrder({ side: "BUY", type: "STOP", lots: 0.1, price: 3995 }, tick, acct)).toBe("price");
    expect(validateOrder({ side: "SELL", type: "LIMIT", lots: 0.1, price: 3995 }, tick, acct)).toBe("price");
    expect(validateOrder({ side: "SELL", type: "STOP", lots: 0.1, price: 3995, sl: 4000, tp: 3990 }, tick, acct)).toBeNull();
    expect(validateOrder({ side: "SELL", type: "STOP", lots: 0.1, price: 3995, sl: 3994 }, tick, acct)).toBe("sl"); // judged from the order's price
  });
  it("not without the free margin for it", () => {
    expect(validateOrder({ side: "BUY", type: "MARKET", lots: 0.3 }, tick, acct)).toBe("margin"); // needs $1,200 at 1:100
  });
});
