// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { BacktestGuide } from "@/components/BacktestGuide";

test("the backtest guide's test windows are the two years before today, not fixed dates", () => {
  const { container } = render(<BacktestGuide now={new Date("2027-03-15T00:00:00Z")} />);
  const text = container.textContent ?? "";
  expect(text).toMatch(/2025\.03\.15 – 2026\.03\.15/);
  expect(text).toMatch(/2026\.03\.15 – 2027\.03\.15/);
  expect(text).not.toMatch(/2024\.11\.20|Scalper|Лондон|London open|lost money|алдагдалтай гарсан/);
});
