// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { SetupChart } from "@/components/SetupChart";

const candles = Array.from({ length: 40 }, (_, i) => ({ time: new Date(Date.UTC(2026, 10, 24, 0, i * 15)).toISOString(), open: 4000 + i, high: 4003 + i, low: 3998 + i, close: 4001 + i }));

test("draws every candle and names the levels for screen readers", () => {
  const { container } = render(<SetupChart candles={candles} side="BUY" entry={4042} stop={4030} target={4066} band={{ high: 4010, low: 3998 }} />);
  expect(container.querySelectorAll("[data-candle]")).toHaveLength(40);
  expect(screen.getByRole("img")).toHaveAccessibleName(/BUY.*4042\.00.*4030\.00.*4066\.00/);
  expect(screen.getByText("Орох")).toBeInTheDocument();
  expect(screen.getByText("Азийн хүрээ")).toBeInTheDocument();
});
test("without levels it still shows the recent price, and without candles it says so", () => {
  const { container, rerender } = render(<SetupChart candles={candles} side={null} entry={null} stop={null} target={null} band={null} />);
  expect(container.querySelectorAll("[data-candle]")).toHaveLength(40);
  expect(screen.queryByText("Орох")).toBeNull();
  rerender(<SetupChart candles={[]} side={null} entry={null} stop={null} target={null} band={null} />);
  expect(screen.getByText(/Лааны дата алга/)).toBeInTheDocument();
});
test("a setup being watched or in play gets an arrow to its target; one that is off does not", () => {
  const { container, rerender } = render(<SetupChart candles={candles} side="BUY" entry={4042} stop={4030} target={4066} band={null} status="WATCH" />);
  expect(container.querySelector("[data-arrow]")).not.toBeNull();
  expect(screen.getAllByText("Таамаг: өсөх").length).toBeGreaterThan(0);
  rerender(<SetupChart candles={candles} side="SELL" entry={4030} stop={4040} target={4010} band={null} status="ACTIVE" at={candles[30].time} />);
  expect(screen.getAllByText("Таамаг: унах").length).toBeGreaterThan(0);
  rerender(<SetupChart candles={candles} side="BUY" entry={4042} stop={4030} target={4066} band={null} status="OFF" />);
  expect(container.querySelector("[data-arrow]")).toBeNull();
});
