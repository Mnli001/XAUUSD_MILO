import { describe, it, expect } from "vitest";
import { orderSetups, bestRecent } from "@/lib/setup/order";
import type { SetupHistory, SetupStatus } from "@/lib/setup/setups";

const h = (n: number, avgR: number | null, winPct: number | null = 50): SetupHistory => ({ n, winPct, avgR, profitFactor: null });
const s = (id: string, status: SetupStatus, recent: SetupHistory = h(0, null, null)) => ({ id, status, recent });

describe("orderSetups", () => {
  it("puts the most actionable first: active, then watch, then forming, then off", () => {
    const out = orderSetups([s("a", "OFF"), s("b", "FORMING"), s("c", "ACTIVE"), s("d", "WATCH")]);
    expect(out.map((x) => x.status)).toEqual(["ACTIVE", "WATCH", "FORMING", "OFF"]);
  });

  it("keeps the fixed order of the rules within the same status, never ranking by win rate", () => {
    const out = orderSetups([s("asian", "WATCH", h(100, 0.1, 40)), s("dip", "WATCH", h(100, 0.1, 90))]);
    expect(out.map((x) => x.id)).toEqual(["asian", "dip"]);
  });

  it("does not change the list it was given", () => {
    const input = [s("a", "OFF"), s("b", "ACTIVE")];
    orderSetups(input);
    expect(input.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("bestRecent", () => {
  it("names the rule with the higher average R when both have 30+ trades", () => {
    expect(bestRecent([s("a", "OFF", h(40, 0.12)), s("b", "OFF", h(35, 0.31))])).toEqual({ id: "b", avgR: 0.31 });
  });

  it("ignores win rate: a high win rate with a lower average R does not win", () => {
    expect(bestRecent([s("a", "OFF", h(50, 0.01, 75)), s("b", "OFF", h(50, 0.2, 45))])?.id).toBe("b");
  });

  it("names nothing when the best average R is zero or negative", () => {
    expect(bestRecent([s("a", "OFF", h(50, -0.1)), s("b", "OFF", h(50, 0))])).toBeNull();
  });

  it("names nothing when fewer than two rules have 30+ trades to compare", () => {
    expect(bestRecent([s("a", "OFF", h(29, 0.5)), s("b", "OFF", h(80, 0.2))])).toBeNull();
  });

  it("names nothing on a tie", () => {
    expect(bestRecent([s("a", "OFF", h(40, 0.2)), s("b", "OFF", h(40, 0.2))])).toBeNull();
  });
});
