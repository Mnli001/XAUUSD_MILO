import { sizeFactor } from "@/lib/setup/sessionRules";
import { ordersField } from "@/lib/bot/live";
import { asianOrderOf } from "@/lib/setup/build";

test("trades are sized by the trends at the breakout: strong ×1.25, weak ×0.75, otherwise ×1", () => {
  expect(sizeFactor(70, 66)).toBe(1.25);
  expect(sizeFactor(-80, -65)).toBe(1.25);
  expect(sizeFactor(70, 30)).toBe(0.75);
  expect(sizeFactor(20, 70)).toBe(0.75);
  expect(sizeFactor(null, 70)).toBe(0.75);
  expect(sizeFactor(50, 40)).toBe(1);
  expect(sizeFactor(70, 50)).toBe(1);
});

test("the factor rides with the robot's order as its eighth field", () => {
  const at = new Date(Date.UTC(2026, 10, 24, 8));
  const o = asianOrderOf({ status: "ACTIVE", side: "BUY", entry: 4024, stop: 4010, target: 4066, at, size: 1.25 }, new Date(at.getTime() + 6e4))!;
  expect(o.size).toBe(1.25);
  const f = ordersField([{ ...o, exitAt: 1 }]).split(",");
  expect(f).toHaveLength(8);
  expect(f[7]).toBe("1.25");
  // A reading without a factor sends 1, so nothing changes for it.
  expect(asianOrderOf({ status: "ACTIVE", side: "BUY", entry: 4024, stop: 4010, target: 4066, at }, at)!.size).toBe(1);
});
