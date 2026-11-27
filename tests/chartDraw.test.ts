import { describe, expect, it } from "vitest";
import { timeToLogical, logicalToTime, magnet, fibLevels, positionStats, newPosition, parseDrawings, DRAWINGS_MAX, type Drawing } from "@/lib/chartDraw";

const H = 36e5;
const opens = [0, H, 2 * H, 4 * H]; // a gap between the 3rd and 4th bar

describe("time and bar position", () => {
  it("a bar's open is its index; between two bars is in between; past the ends goes on at one bar a step", () => {
    expect(timeToLogical(H, opens, H)).toBe(1);
    expect(timeToLogical(1.5 * H, opens, H)).toBe(1.5);
    expect(timeToLogical(3 * H, opens, H)).toBe(2.5); // halfway across the gap
    expect(timeToLogical(6 * H, opens, H)).toBe(5);
    expect(timeToLogical(-H, opens, H)).toBe(-1);
  });
  it("and back again", () => {
    for (const l of [-1, 0, 1.5, 2.5, 5]) expect(timeToLogical(logicalToTime(l, opens, H)!, opens, H)).toBeCloseTo(l, 9);
    expect(logicalToTime(2.5, opens, H)).toBe(3 * H);
    expect(logicalToTime(5, opens, H)).toBe(6 * H);
  });
  it("no bars: nothing to place on", () => {
    expect(timeToLogical(0, [], H)).toBeNull();
  });
});

describe("helpers", () => {
  const bar = { time: 0, open: 100, high: 105, low: 95, close: 102 };
  it("the magnet pulls a price to the bar's nearest open, high, low or close when it is close enough", () => {
    expect(magnet(104.6, bar, 1)).toBe(105);
    expect(magnet(98.6, bar, 1)).toBe(98.6);
    expect(magnet(95.2, null, 1)).toBe(95.2);
  });
  it("Fibonacci retracement levels from the swing's start to its end", () => {
    const lv = fibLevels(100, 200);
    expect(lv.map((l) => l.ratio)).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
    expect(lv.find((l) => l.ratio === 0.618)!.price).toBeCloseTo(138.2); // measured back from the end
    expect(lv.find((l) => l.ratio === 0)!.price).toBe(200);
  });
  it("a long position's targets and R:R", () => {
    const d: Drawing = { id: "x", kind: "long", a: { t: 0, p: 100 }, b: { t: H, p: 110 }, c: { t: 0, p: 95 }, color: "green" };
    expect(positionStats(d)).toEqual({ side: "BUY", entry: 100, tp: 110, sl: 95, reward: 10, risk: 5, rr: 2 });
    const s = newPosition("short", { t: 0, p: 100 }, 4, H);
    expect(s.kind).toBe("short");
    expect(positionStats(s)).toMatchObject({ side: "SELL", entry: 100, sl: 104, tp: 92, rr: 2 });
    expect(s.b!.t).toBe(20 * H);
  });
});

describe("what may be saved", () => {
  it("keeps sound drawings, drops broken ones, and caps the count", () => {
    const ok = { id: "a", kind: "trend", a: { t: 1, p: 2 }, b: { t: 3, p: 4 }, color: "amber" };
    expect(parseDrawings([ok, { id: "b", kind: "laser" }, { id: "c", kind: "hline", a: { t: 0, p: NaN }, color: "amber" }, "x"])).toEqual([ok]);
    expect(parseDrawings(Array.from({ length: DRAWINGS_MAX + 5 }, (_, i) => ({ ...ok, id: String(i) })))).toHaveLength(DRAWINGS_MAX);
    expect(parseDrawings({ not: "a list" })).toEqual([]);
    expect(parseDrawings([{ ...ok, kind: "text", text: "x".repeat(500) }])[0].text).toHaveLength(120);
  });
});

import { beforeEach } from "vitest";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { loadDrawings, saveDrawings } from "@/lib/drawings";

describe("saved per member", () => {
  beforeEach(resetDb);
  it("what one member draws is theirs alone, and saving again replaces it", async () => {
    const u = await makeUser("draw@x.mn"), other = await makeUser("other@x.mn");
    expect(await loadDrawings(u.id)).toEqual([]);
    await saveDrawings(u.id, [{ id: "a", kind: "hline", a: { t: 1, p: 4000 }, color: "blue" }, { id: "bad", kind: "x" }]);
    expect((await loadDrawings(u.id)).map((d) => d.id)).toEqual(["a"]);
    expect(await loadDrawings(other.id)).toEqual([]);
    await saveDrawings(u.id, []);
    expect(await loadDrawings(u.id)).toEqual([]);
  });
});
