// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { JournalPanel } from "@/components/JournalView";
import { journalStats, type JRow } from "@/lib/journalStats";
import { MN_VIEWER } from "@/lib/viewer";

const row = (o: Partial<JRow>): JRow => ({ symbol: "XAUUSD", side: "BUY", lots: 0.1, openPrice: 4000, closePrice: 4001, openTime: new Date("2026-11-02T08:00:00Z"), closeTime: new Date("2026-11-02T09:00:00Z"), profit: 10, magic: "0", ...o });

test("shows the totals, the lessons and the trades", () => {
  const rows = [row({ profit: 30 }), row({ profit: -10, side: "SELL", closeTime: new Date("2026-11-02T10:00:00Z") })];
  render(<JournalPanel rows={rows} s={journalStats(rows, MN_VIEWER)} v={MN_VIEWER} filter={{ src: "all", days: "90", login: "" }} logins={["5001"]} />);
  expect(screen.getByRole("region", { name: "Нийт дүн" })).toHaveTextContent("+$20.00");
  expect(screen.getByRole("region", { name: "Нийт дүн" })).toHaveTextContent("50%");
  const table = screen.getByRole("table", { name: "Сүүлийн trade-үүд" });
  expect(within(table).getAllByRole("row")).toHaveLength(3); // header + 2
  expect(screen.getByRole("link", { name: "Гараар" })).toHaveAttribute("href", "/journal?src=manual&days=90");
});

test("explains how trades get here when there are none", () => {
  render(<JournalPanel rows={[]} s={journalStats([], MN_VIEWER)} v={MN_VIEWER} filter={{ src: "all", days: "90", login: "" }} logins={[]} />);
  expect(screen.getByText(/v3\.90/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Бот руу очих" })).toHaveAttribute("href", "/bot");
});
