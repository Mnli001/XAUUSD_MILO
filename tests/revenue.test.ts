import { describe, it, expect, beforeEach, vi } from "vitest";
const requireAdmin = vi.fn(async () => ({ id: "admin", role: "ADMIN" }));
vi.mock("@/lib/auth", () => ({ requireAdmin: () => requireAdmin() }));
import { revenueReport, getRevenue, ubMonth, type PaidRow, type UserRow } from "@/lib/revenue";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";

const DAY = 864e5;
const now = new Date("2026-11-26T12:00:00Z");
const d = (iso: string) => new Date(iso);
const pay = (userId: string, plan: string, amount: number, paidAt: string, accessUntil: string): PaidRow => ({ userId, plan, amount, paidAt: d(paidAt), accessUntil: d(accessUntil) });
const user = (id: string, accessUntil: string | null, role: "USER" | "ADMIN" = "USER", email = `${id}@x.mn`): UserRow => ({ id, email, role, accessUntil: accessUntil ? d(accessUntil) : null });

describe("ubMonth", () => {
  it("counts months on the Ulaanbaatar clock: 30 Nov 17:00 UTC is already December there", () => {
    expect(ubMonth(d("2026-11-30T15:59:00Z"))).toBe("2026-11");
    expect(ubMonth(d("2026-11-30T16:00:00Z"))).toBe("2026-12");
  });
});

describe("revenueReport", () => {
  const users = [
    user("a", "2027-05-01T00:00:00Z"), // active, renewed
    user("b", "2026-11-29T00:00:00Z"), // active, ends in 3 days
    user("c", "2026-11-10T00:00:00Z"), // ran out 16 days ago, did not renew
    user("e", null), // registered, never paid
    user("adm", null, "ADMIN"),
  ];
  const paid = [
    pay("a", "PLUS", 50000, "2026-10-05T03:00:00Z", "2026-11-04T03:00:00Z"),
    pay("a", "PRO", 150000, "2026-11-03T03:00:00Z", "2027-05-01T00:00:00Z"), // a renewal this month
    pay("b", "PLUS", 50000, "2026-10-30T03:00:00Z", "2026-11-29T00:00:00Z"),
    pay("c", "PLUS", 50000, "2026-10-11T03:00:00Z", "2026-11-10T00:00:00Z"),
  ];
  const r = revenueReport(paid, users, now);

  it("this month's and last month's revenue, with new payers and renewals told apart", () => {
    expect(r.thisMonth).toEqual({ key: "2026-11", revenue: 150000, payments: 1, newPayers: 0, renewals: 1 });
    expect(r.lastMonth).toEqual({ key: "2026-10", revenue: 150000, payments: 3, newPayers: 3, renewals: 0 });
  });

  it("six months oldest first, empty months as zero", () => {
    expect(r.months.map((m) => [m.key, m.revenue])).toEqual([["2026-06", 0], ["2026-07", 0], ["2026-08", 0], ["2026-09", 0], ["2026-10", 150000], ["2026-11", 150000]]);
  });

  it("active subscribers leave out admins; those ending within a week are listed soonest first", () => {
    expect(r.active).toBe(2);
    expect(r.endingSoon.map((u) => u.email)).toEqual(["b@x.mn"]);
  });

  it("of the plans that came due in the last 30 days, who renewed and who left", () => {
    expect(r.cameDue).toBe(2); // a (4 Nov) and c (10 Nov); b is not due yet
    expect(r.renewed).toBe(1);
    expect(r.left.map((u) => u.email)).toEqual(["c@x.mn"]);
    expect(r.renewalPct).toBe(50);
  });

  it("all-time totals, paying share of registered users, and the plan mix", () => {
    expect(r.allTime).toEqual({ revenue: 300000, payments: 4, payers: 3, registered: 4, payingPct: 75 });
    expect(r.plans).toEqual([
      { plan: "PLUS", payments: 3, revenue: 150000 },
      { plan: "PRO", payments: 1, revenue: 150000 },
      { plan: "MAX", payments: 0, revenue: 0 },
    ]);
  });

  it("is all zeros with nothing paid, and no renewal rate", () => {
    const empty = revenueReport([], [user("e", null)], now);
    expect(empty.thisMonth.revenue).toBe(0);
    expect(empty.renewalPct).toBeNull();
    expect(empty.allTime.payingPct).toBe(0);
  });
});

describe("getRevenue", () => {
  beforeEach(async () => { await resetDb(); });
  it("reads paid payments only, with each payer's email", async () => {
    const u = await makeUser("p@x.mn");
    await db.update(schema.users).set({ accessUntil: new Date(now.getTime() + 20 * DAY) }).where(eq(u.id));
    const base = { userId: u.id, days: 30, expiresAt: now };
    await db.insert(schema.payments).values([
      { ...base, plan: "PLUS", amount: 50000, status: "PAID", senderInvoiceNo: "1", createdAt: now, paidAt: d("2026-11-20T00:00:00Z"), accessUntil: new Date(now.getTime() + 20 * DAY) },
      { ...base, plan: "PRO", amount: 150000, status: "PENDING", senderInvoiceNo: "2", createdAt: now },
      { ...base, plan: "MAX", amount: 300000, status: "EXPIRED", senderInvoiceNo: "3", createdAt: now },
    ]);
    const r = await getRevenue(now);
    expect(r.thisMonth.revenue).toBe(50000);
    expect(r.active).toBe(1);
  });
  it("still counts money from accounts deleted since, and needs an admin", async () => {
    await db.insert(schema.payments).values({ userId: null, days: 30, expiresAt: now, plan: "PLUS", amount: 50000, status: "PAID", senderInvoiceNo: "9", createdAt: now, paidAt: d("2026-11-21T00:00:00Z"), accessUntil: null });
    const r = await getRevenue(now);
    expect(r.thisMonth.revenue).toBe(50000);
    expect(r.allTime.payers).toBe(1);
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
    await expect(getRevenue(now)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

import { eq as eqOp } from "drizzle-orm";
function eq(id: string) { return eqOp(schema.users.id, id); }

describe("user flow", () => {
  const u = (id: string, created: string, accessUntil: string | null = null): UserRow => ({ id, email: `${id}@x.mn`, role: "USER", accessUntil: accessUntil ? d(accessUntil) : null, createdAt: d(created) });
  const users = [
    u("a", "2026-10-01T03:00:00Z", "2027-05-01T00:00:00Z"), // October signup, paid twice, active
    u("b", "2026-11-02T03:00:00Z", "2026-11-29T00:00:00Z"), // November signup, paid once, active
    u("c", "2026-11-05T03:00:00Z"), // November signup, never paid
    u("e", "2026-11-20T03:00:00Z"), // November signup, never paid
    u("f", "2026-11-30T16:30:00Z"), // already December in Ulaanbaatar: after `now`, so not counted in a month shown
    { id: "adm", email: "adm@x.mn", role: "ADMIN" as const, accessUntil: null, createdAt: d("2026-11-01T00:00:00Z") },
  ];
  const paid = [
    pay("a", "PLUS", 50000, "2026-10-05T03:00:00Z", "2026-11-04T03:00:00Z"),
    pay("a", "PRO", 150000, "2026-11-03T03:00:00Z", "2027-05-01T00:00:00Z"),
    pay("b", "PLUS", 50000, "2026-11-03T03:00:00Z", "2026-11-29T00:00:00Z"),
  ];
  const r = revenueReport(paid, users, now);

  it("counts signups per month and how many of them have paid since", () => {
    expect(r.signups.map((m) => m.key)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(r.signups.at(-1)).toEqual({ key: "2026-11", signups: 3, paid: 1, paidPct: 33 });
    expect(r.signups.at(-2)).toEqual({ key: "2026-10", signups: 1, paid: 1, paidPct: 100 });
    expect(r.signups[0]).toEqual({ key: "2026-06", signups: 0, paid: 0, paidPct: null });
  });
  it("walks the funnel from registered to paid to paid again to active now", () => {
    expect(r.funnel).toEqual({ registered: 5, paid: 2, repeat: 1, active: 2 });
  });
});
