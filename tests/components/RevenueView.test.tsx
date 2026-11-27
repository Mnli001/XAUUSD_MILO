// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { RevenueView } from "@/components/RevenueView";
import { revenueReport } from "@/lib/revenue";
import { MN_VIEWER } from "@/lib/viewer";

const now = new Date("2026-11-26T12:00:00Z");
const d = (s: string) => new Date(s);
const report = revenueReport(
  [
    { userId: "a", plan: "PLUS", amount: 50000, paidAt: d("2026-10-05T03:00:00Z"), accessUntil: d("2026-11-04T03:00:00Z") },
    { userId: "a", plan: "PRO", amount: 150000, paidAt: d("2026-11-03T03:00:00Z"), accessUntil: d("2027-05-01T00:00:00Z") },
    { userId: "b", plan: "PLUS", amount: 50000, paidAt: d("2026-10-30T03:00:00Z"), accessUntil: d("2026-11-29T00:00:00Z") },
    { userId: "c", plan: "PLUS", amount: 50000, paidAt: d("2026-10-11T03:00:00Z"), accessUntil: d("2026-11-10T00:00:00Z") },
  ],
  [
    { id: "a", email: "a@x.mn", role: "USER", accessUntil: d("2027-05-01T00:00:00Z") },
    { id: "b", email: "b@x.mn", role: "USER", accessUntil: d("2026-11-29T00:00:00Z") },
    { id: "c", email: "c@x.mn", role: "USER", accessUntil: d("2026-11-10T00:00:00Z") },
    { id: "e", email: "e@x.mn", role: "USER", accessUntil: null },
  ],
  now,
);

test("the headline figures: this month against last, active subscribers, renewal rate, all time", () => {
  render(<RevenueView r={report} v={MN_VIEWER} />);
  const month = screen.getByText("Энэ сарын орлого").closest("div")!;
  expect(within(month).getByText("150,000₮")).toBeInTheDocument();
  expect(within(month).getByText(/Өмнөх сар 150,000₮/)).toBeInTheDocument();
  expect(within(screen.getByText("Идэвхтэй захиалагч").closest("div")!).getByText("2")).toBeInTheDocument();
  const renew = screen.getByText("Сунгасан хувь").closest("div")!;
  expect(within(renew).getByText("50%")).toBeInTheDocument();
  expect(within(renew).getByText(/2-оос 1 нь сунгасан/)).toBeInTheDocument();
  expect(within(screen.getByText("Нийт орлого").closest("div")!).getByText("300,000₮")).toBeInTheDocument();
});

test("the monthly chart has one bar per month, each named with its amount, and a table of the same numbers", () => {
  render(<RevenueView r={report} v={MN_VIEWER} />);
  const chart = screen.getByRole("img", { name: /Сүүлийн 6 сарын орлого/ });
  expect(chart.querySelectorAll("[data-bar]")).toHaveLength(6);
  expect(screen.getByTitle("2026-10: 150,000₮, 3 төлбөр")).toBeInTheDocument();
  const table = screen.getByRole("table", { name: /Сар бүрийн орлого/ });
  expect(within(table).getAllByRole("row")).toHaveLength(7);
});

test("who to contact: plans ending this week and those who did not renew", () => {
  render(<RevenueView r={report} v={MN_VIEWER} />);
  expect(within(screen.getByRole("region", { name: /7 хоногт дуусах/ })).getByText("b@x.mn")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: /Сунгаагүй/ })).getByText("c@x.mn")).toBeInTheDocument();
});

test("the plan mix lists Plus, Pro and Max with counts and revenue", () => {
  render(<RevenueView r={report} v={MN_VIEWER} />);
  const mix = screen.getByRole("region", { name: /Багцаар/ });
  expect(within(mix).getByText("Plus").closest("tr")!.textContent).toMatch(/3.*150,000₮/);
  expect(within(mix).getByText("Max").closest("tr")!.textContent).toMatch(/0.*0₮/);
});

test("the user flow shows the funnel and signups month by month", () => {
  const r = revenueReport(
    [{ userId: "a", plan: "PLUS", amount: 50000, paidAt: d("2026-11-03T03:00:00Z"), accessUntil: d("2026-12-03T03:00:00Z") }],
    [
      { id: "a", email: "a@x.mn", role: "USER", accessUntil: d("2026-12-03T03:00:00Z"), createdAt: d("2026-11-02T03:00:00Z") },
      { id: "b", email: "b@x.mn", role: "USER", accessUntil: null, createdAt: d("2026-11-10T03:00:00Z") },
    ],
    now,
  );
  render(<RevenueView r={r} v={MN_VIEWER} />);
  const flow = screen.getByRole("region", { name: "Хэрэглэгчийн урсгал" });
  expect(within(flow).getByText("Энэ сард 2 бүртгүүлсэн · өмнөх сард 0")).toBeInTheDocument();
  const steps = within(within(flow).getByRole("list", { name: "Бүртгүүлснээс идэвхтэй хүртэл" })).getAllByRole("listitem").map((li) => li.textContent);
  expect(steps).toEqual(["Бүртгүүлсэн2", "Төлбөр хийсэн1бүртгүүлсний 50%", "Дахин төлсөн0төлсний 0%", "Одоо идэвхтэй1бүртгүүлсний 50%"]);
  const nov = within(within(flow).getByRole("table", { name: "Сар бүр бүртгүүлсэн" })).getByText("2026-11").closest("tr")!;
  expect(nov.textContent).toBe("2026-112150%");
});
