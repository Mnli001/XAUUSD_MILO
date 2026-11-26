// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { SignalHistoryTable, SignalTotals } from "@/components/SignalHistory";
import { MN_VIEWER } from "@/lib/viewer";
import type { SignalRow } from "@/lib/signalHistory";

const base = { sentTo: 0, name: "Азийн хүрээний breakout", setupId: "asian-breakout", resultSentAt: null };
const rows: SignalRow[] = [
  { ...base, id: "1", key: "1", side: "SELL", entry: 3510.26, stop: 3544.01, target: 3442.77, createdAt: new Date("2026-11-25T11:47:00Z"), outcome: { kind: "WIN", r: 2, at: new Date("2026-11-25T15:00:00Z") } },
  { ...base, id: "2", key: "2", side: "SELL", entry: 3609.77, stop: 3647.41, target: 3534.47, createdAt: new Date("2026-11-24T08:33:00Z"), outcome: { kind: "LOSS", r: -1, at: new Date("2026-11-24T10:00:00Z") } },
  { ...base, id: "3", key: "3", side: "BUY", entry: 3500, stop: 3490, target: 3530, createdAt: new Date("2026-11-23T08:00:00Z"), outcome: { kind: "TIME", r: -0.35, at: new Date("2026-11-23T20:00:00Z") } },
  { ...base, id: "4", key: "4", side: "BUY", entry: 3500, stop: 3490, target: 3530, createdAt: new Date("2026-11-26T08:00:00Z"), outcome: { kind: "OPEN", r: null, at: null } },
];
const rowOf = (entry: string) => screen.getByText(entry).closest("tr")!;

test("a target hit is a green row that says so, a stop is a red row that says so", () => {
  render(<SignalHistoryTable rows={rows} v={MN_VIEWER} />);
  const win = rowOf("3,510.26");
  expect(win).toHaveAttribute("data-result", "win");
  expect(within(win).getByText(/Target/)).toBeInTheDocument();
  expect(within(win).getByText("+2.00R")).toBeInTheDocument();
  const loss = rowOf("3,609.77");
  expect(loss).toHaveAttribute("data-result", "loss");
  expect(within(loss).getByText(/Stop/)).toBeInTheDocument();
  expect(within(loss).getByText("−1.00R")).toBeInTheDocument();
  expect(win.className).toMatch(/emerald/);
  expect(loss.className).toMatch(/red/);
});

test("a time exit is green or red by its result, and an open signal stays neutral", () => {
  render(<SignalHistoryTable rows={rows} v={MN_VIEWER} />);
  const time = screen.getAllByText("3,500.00")[0].closest("tr")!;
  expect(time).toHaveAttribute("data-result", "loss");
  expect(within(time).getByText(/Цагаар/)).toBeInTheDocument();
  const open = screen.getAllByText("3,500.00")[1].closest("tr")!;
  expect(open).toHaveAttribute("data-result", "open");
  expect(within(open).getByText(/Нээлттэй/)).toBeInTheDocument();
});

test("the totals count wins, losses, open signals and the sum in R", () => {
  render(<SignalTotals rows={rows} t={MN_VIEWER.t} />);
  expect(screen.getByText("+0.65R")).toBeInTheDocument();
  expect(screen.getByText(/1 ашигтай/)).toBeInTheDocument();
  expect(screen.getByText(/2 алдагдалтай/)).toBeInTheDocument();
  expect(screen.getByText(/1 нээлттэй/)).toBeInTheDocument();
});

test("the side column has a name for screen readers, and dates show the year only when it is not this year", () => {
  const now = new Date("2026-11-27T00:00:00Z");
  const old = { ...rows[0], id: "9", key: "9", entry: 2999.5, createdAt: new Date("2025-12-30T02:00:00Z") };
  render(<SignalHistoryTable rows={[rows[0], old]} v={MN_VIEWER} now={now} />);
  expect(screen.getByRole("columnheader", { name: "Чиглэл" })).toBeInTheDocument();
  expect(within(rowOf("3,510.26")).getByText("11-25 19:47")).toBeInTheDocument();
  expect(within(rowOf("2,999.50")).getByText("2025-12-30 10:00")).toBeInTheDocument();
});

test("the totals can name the window they cover", () => {
  render(<SignalTotals rows={rows} t={MN_VIEWER.t} caption="Сүүлийн 60 дохио" />);
  expect(screen.getByText("Сүүлийн 60 дохио")).toBeInTheDocument();
});

test("with no signals it says where they will come from", () => {
  render(<SignalHistoryTable rows={[]} v={MN_VIEWER} />);
  expect(screen.getByText(/дохио гараагүй/)).toBeInTheDocument();
});
