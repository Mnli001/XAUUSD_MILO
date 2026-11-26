import { describe, it, expect } from "vitest";
import { lotSize } from "@/lib/lot";

describe("lotSize", () => {
  it("risk in dollars over the stop distance, at 100 oz a lot, rounded down to 0.01", () => {
    // $1,000 at 1% = $10 at risk; a $5 stop costs $5 per 0.01 lot -> 0.02 lot
    expect(lotSize({ balance: 1000, riskPct: 1, stop: 5, target: 15 })).toEqual({ lots: 0.02, risk: 10, riskPct: 1, reward: 30, belowMin: false });
  });
  it("never rounds up past the chosen risk", () => {
    const r = lotSize({ balance: 1000, riskPct: 1, stop: 3.4, target: null })!;
    expect(r.lots).toBe(0.02); // 10 / 3.4 = 2.94 hundredths
    expect(r.risk).toBeCloseTo(6.8, 5);
    expect(r.reward).toBeNull();
  });
  it("when even 0.01 lot risks more than chosen, says so and shows what 0.01 would risk", () => {
    expect(lotSize({ balance: 200, riskPct: 1, stop: 33.75, target: 101.25 })).toEqual({ lots: 0.01, risk: 33.75, riskPct: 16.88, reward: 101.25, belowMin: true });
  });
  it("is null for nonsense input", () => {
    expect(lotSize({ balance: 0, riskPct: 1, stop: 5, target: null })).toBeNull();
    expect(lotSize({ balance: 1000, riskPct: 0, stop: 5, target: null })).toBeNull();
    expect(lotSize({ balance: 1000, riskPct: 1, stop: 0, target: null })).toBeNull();
    expect(lotSize({ balance: NaN, riskPct: 1, stop: 5, target: null })).toBeNull();
  });
  it("handles a big balance without floating noise", () => {
    expect(lotSize({ balance: 50000, riskPct: 0.5, stop: 12.5, target: 25 })?.lots).toBe(0.2);
  });
});
