// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/journal" }));
vi.mock("@/lib/actions/journal", () => ({ saveManualTradeAction: vi.fn(async () => ({})), deleteManualTradeAction: vi.fn(async () => {}) }));
import { JournalPanel } from "@/components/JournalView";
import { journalStats, type JRow } from "@/lib/journalStats";
import { MN_VIEWER } from "@/lib/viewer";

const row = (o: Partial<JRow>): JRow => ({ symbol: "XAUUSD", side: "BUY", lots: 0.1, openPrice: 4000, closePrice: 4001, openTime: new Date("2026-11-02T08:00:00Z"), closeTime: new Date("2026-11-02T09:00:00Z"), profit: 10, magic: "0", ...o });
const filter = { src: "all" as const, days: "90" as const, login: "" };
const manual = { today: "2026-11-27" };

test("shows the totals, the lessons and the trades", () => {
  const rows = [row({ profit: 30 }), row({ profit: -10, side: "SELL", closeTime: new Date("2026-11-02T10:00:00Z") })];
  render(<JournalPanel rows={rows} s={journalStats(rows, MN_VIEWER)} v={MN_VIEWER} filter={filter} logins={["5001"]} />);
  expect(screen.getByRole("region", { name: "Нийт дүн" })).toHaveTextContent("+$20.00");
  expect(screen.getByRole("region", { name: "Нийт дүн" })).toHaveTextContent("50%");
  const table = screen.getByRole("table", { name: "Сүүлийн trade-үүд" });
  expect(within(table).getAllByRole("row")).toHaveLength(3); // header + 2
  expect(screen.getByRole("link", { name: "Гараар" })).toHaveAttribute("href", "/journal?src=manual&days=90");
});

test("explains both ways in when there are none, and opens the hand-entry form", () => {
  render(<JournalPanel rows={[]} s={journalStats([], MN_VIEWER)} v={MN_VIEWER} filter={filter} logins={[]} manual={manual} />);
  expect(screen.getByText(/v3\.90/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Робот руу очих" })).toHaveAttribute("href", "/bot");
  const form = screen.getByRole("form", { name: "Арилжаа нэмэх" });
  expect(form.closest("details")).toHaveAttribute("open");
  expect(within(form).getByLabelText(/Огноо/)).toHaveValue("2026-11-27");
});

test("the form works the P/L out as you type, with R when a stop is given", () => {
  render(<JournalPanel rows={[]} s={journalStats([], MN_VIEWER)} v={MN_VIEWER} filter={filter} logins={[]} manual={manual} />);
  fireEvent.change(screen.getByLabelText("Орсон үнэ"), { target: { value: "4000" } });
  fireEvent.change(screen.getByLabelText("Гарсан үнэ"), { target: { value: "4012" } });
  fireEvent.change(screen.getByLabelText("Lot"), { target: { value: "0.1" } });
  expect(screen.getByText("+$120.00")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Stop/), { target: { value: "3994" } });
  expect(document.body.textContent).toContain("+2.00R");
  fireEvent.click(screen.getByLabelText(/SELL/));
  expect(screen.getByText("−$120.00")).toBeInTheDocument();
});

test("written trades carry edit and delete; MT5 trades do not; without a plan one line says the MT5 ones come with a plan", () => {
  const rows = [row({ source: "web", ticket: "w1", note: "NY нээлт" }), row({ source: "mt5", ticket: "77", magic: "5", closeTime: new Date("2026-11-02T11:00:00Z") })];
  render(<JournalPanel rows={rows} s={journalStats(rows, MN_VIEWER)} v={MN_VIEWER} filter={filter} logins={[]} manual={manual} locked />);
  const table = screen.getByRole("table", { name: "Сүүлийн trade-үүд" });
  expect(within(table).getAllByRole("link", { name: "Засах" })).toHaveLength(1);
  expect(within(table).getByRole("link", { name: "Засах" })).toHaveAttribute("href", "/journal?edit=w1#entry");
  expect(within(table).getAllByRole("button", { name: "Устгах" })).toHaveLength(1);
  expect(within(table).getByText("Бичсэн")).toBeInTheDocument();
  expect(within(table).getByText("NY нээлт")).toBeInTheDocument();
  expect(screen.getByText(/MT5 данснаас робот автоматаар илгээх арилжаа багцтай харагдана/)).toBeInTheDocument();
});

test("editing fills the form with the trade and offers Cancel", () => {
  const initial = { ticket: "w1", date: "2026-11-20", openAt: "09:15", closeAt: "", side: "SELL" as const, openPrice: "4050", closePrice: "4040", lots: "0.2", stopLoss: "", note: "x" };
  render(<JournalPanel rows={[row({ source: "web", ticket: "w1" })]} s={journalStats([], MN_VIEWER)} v={MN_VIEWER} filter={filter} logins={[]} manual={{ today: "2026-11-27", initial }} />);
  const form = screen.getByRole("form", { name: "Арилжаа засах" });
  expect(within(form).getByLabelText("Орсон үнэ")).toHaveValue("4050");
  expect(form.querySelector('input[name="ticket"]')).toHaveValue("w1");
  expect(within(form).getByRole("link", { name: "Болих" })).toHaveAttribute("href", "/journal");
});
