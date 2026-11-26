// @vitest-environment jsdom
import { render, screen, fireEvent, within } from "@testing-library/react";
import { vi } from "vitest";
vi.mock("@/components/PrefsProvider", async () => { const { MN_VIEWER } = await import("@/lib/viewer"); return { useViewer: () => MN_VIEWER }; });
import { BotTradeHistory } from "@/components/BotTradeHistory";
import type { BotChartTrade } from "@/lib/botChart";

const now = Date.parse("2026-11-26T12:00:00Z");
const tr = (ticket: string, profit: number, closedAt: string, openedAt: string | null = null): BotChartTrade => ({ ticket, side: profit >= 0 ? "BUY" : "SELL", lots: 0.01, openPrice: 2600, closePrice: 2610, profit, openedAt, closedAt });
const trades = [
  tr("a", 12.5, "2026-11-26T09:00:00Z", "2026-11-26T08:00:00Z"),
  tr("b", -4, "2026-11-25T09:00:00Z"),
  tr("c", 7, "2026-11-10T09:00:00Z"),
];

test("today, the last 7 days and everything listed, with profit green and loss red", () => {
  render(<BotTradeHistory trades={trades} now={now} onPick={() => {}} />);
  const today = screen.getByText("Өнөөдөр").closest("div")!;
  expect(within(today).getByText("+$12.50")).toBeInTheDocument();
  expect(within(screen.getByText("Сүүлийн 7 хоног").closest("div")!).getByText("+$8.50")).toBeInTheDocument();
  expect(within(screen.getByText(/Нийт/).closest("div")!).getByText("+$15.50")).toBeInTheDocument();
  expect(screen.getAllByRole("row").filter((r) => r.dataset.result === "win")).toHaveLength(2);
  expect(screen.getAllByRole("row").filter((r) => r.dataset.result === "loss")).toHaveLength(1);
});

test("'On chart' shows the trade from where it was entered (or closed, without an entry record)", () => {
  const onPick = vi.fn();
  render(<BotTradeHistory trades={trades} now={now} onPick={onPick} />);
  const buttons = screen.getAllByRole("button", { name: "Чартад" });
  fireEvent.click(buttons[0]);
  fireEvent.click(buttons[1]);
  expect(onPick.mock.calls).toEqual([[Date.parse("2026-11-26T08:00:00Z")], [Date.parse("2026-11-25T09:00:00Z")]]);
});

test("long histories show 20 at a time", () => {
  const many = Array.from({ length: 45 }, (_, i) => tr(`t${i}`, 1, new Date(now - i * 36e5).toISOString()));
  render(<BotTradeHistory trades={many} now={now} onPick={() => {}} />);
  expect(screen.getAllByRole("button", { name: "Чартад" })).toHaveLength(20);
  fireEvent.click(screen.getByRole("button", { name: /Цааш харах \(25\)/ }));
  expect(screen.getAllByRole("button", { name: "Чартад" })).toHaveLength(40);
});
