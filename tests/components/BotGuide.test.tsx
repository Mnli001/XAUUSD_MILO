// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { BotGuide, BacktestGuide } from "@/components/BotGuide";
import { viewer } from "@/lib/viewer";

const record = { n: 209, winPct: 48, profitFactor: 1.44, from: "2019-01", source: "JustMarkets XAUUSD", checkedOn: "2026-11-26" };

test("the guide names the address to allow in MT5 and links the robot file", () => {
  render(<BotGuide origin="https://example.mn" hasToken={false} online={false} />);
  expect(screen.getAllByText("https://example.mn").length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: /XauBot\.ex5/ })).toHaveAttribute("href", "/api/bot/download?file=ex5");
  expect(screen.getByText(/Allow WebRequest/)).toBeInTheDocument();
});
test("it starts open until the robot is connected, then folds away", () => {
  const { container, rerender } = render(<BotGuide origin="https://example.mn" hasToken={false} online={false} />);
  expect(container.querySelector("details")).toHaveAttribute("open");
  rerender(<BotGuide origin="https://example.mn" hasToken online />);
  expect(container.querySelector("details")).not.toHaveAttribute("open");
});
test("it describes the four tools that exist, Basket as experimental, and no retired Scalper", () => {
  for (const locale of ["mn", "en"] as const) {
    const { container, unmount } = render(<BotGuide origin="https://example.mn" hasToken={false} online={false} v={viewer({ locale, timeZone: "Asia/Ulaanbaatar" })} record={record} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Scalper/i);
    expect(text).toMatch(locale === "en" ? /Setup signals[^]*Day trader[^]*Reading[^]*Basket/ : /Setup дохио[^]*Day trader[^]*Дүгнэлт[^]*Багц/);
    expect(text).toMatch(locale === "en" ? /experimental/ : /туршилтын/);
    expect(text).not.toMatch(/only rule that cleared|цорын ганц дүрэм/);
    expect(text).toMatch(/209/); // the one research record, the same as on the Setup page
    expect(text).toMatch(/Windows/);
    unmount();
  }
});
test("the backtest guide's test windows are the two years before today, not fixed dates", () => {
  const { container } = render(<BacktestGuide now={new Date("2027-03-15T00:00:00Z")} />);
  const text = container.textContent ?? "";
  expect(text).toMatch(/2025\.03\.15 – 2026\.03\.15/);
  expect(text).toMatch(/2026\.03\.15 – 2027\.03\.15/);
  expect(text).not.toMatch(/2024\.11\.20|Scalper|Лондон|London open|lost money|алдагдалтай гарсан/);
});
