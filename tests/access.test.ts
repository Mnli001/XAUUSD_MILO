import { hasAccess } from "@/lib/access";

test("hasAccess", () => {
  const now = new Date("2026-11-20T00:00:00Z");
  expect(hasAccess({ role: "ADMIN", accessUntil: null }, now)).toBe(true);
  expect(hasAccess({ role: "USER", accessUntil: null }, now)).toBe(false);
  expect(hasAccess({ role: "USER", accessUntil: new Date("2026-11-19T00:00:00Z") }, now)).toBe(false);
  expect(hasAccess({ role: "USER", accessUntil: new Date("2026-12-01T00:00:00Z") }, now)).toBe(true);
});
