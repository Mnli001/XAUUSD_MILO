import { describe, it, expect } from "vitest";
import { PLANS, isPlanId, extendAccess } from "@/lib/plans";

const DAY = 864e5;

describe("plans", () => {
  it("are Plus 30 days 50,000₮, Pro 180 days 150,000₮, Max 365 days 300,000₮", () => {
    expect(PLANS.PLUS).toMatchObject({ name: "Plus", days: 30, amount: 50000 });
    expect(PLANS.PRO).toMatchObject({ name: "Pro", days: 180, amount: 150000 });
    expect(PLANS.MAX).toMatchObject({ name: "Max", days: 365, amount: 300000 });
  });

  it("knows its ids and nothing else", () => {
    expect(["PLUS", "PRO", "MAX"].every(isPlanId)).toBe(true);
    for (const v of ["plus", "GOLD", "", null, 3]) expect(isPlanId(v)).toBe(false);
  });
});

describe("extendAccess", () => {
  const now = new Date("2026-11-26T10:00:00Z");
  it("starts from now when there was no access", () => {
    expect(extendAccess(null, now, 30).getTime()).toBe(now.getTime() + 30 * DAY);
  });
  it("starts from now when access already ended", () => {
    expect(extendAccess(new Date(now.getTime() - 5 * DAY), now, 30).getTime()).toBe(now.getTime() + 30 * DAY);
  });
  it("adds to the end date when access is still running, so renewing early loses nothing", () => {
    const end = new Date(now.getTime() + 10 * DAY);
    expect(extendAccess(end, now, 180).getTime()).toBe(end.getTime() + 180 * DAY);
  });
});
