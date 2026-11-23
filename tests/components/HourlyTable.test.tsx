// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { HourlyTable } from "@/components/HourlyTable";
import type { HourRow } from "@/lib/analysis/hourly";

const row = (o: Partial<HourRow>): HourRow => ({ hour: 0, session: "Ази", n: 100, upPct: 60, nCond: 50, upPctCond: 70, avgMove: 3.2, ...o });

test("never prints a percentage for small samples", () => {
  render(<HourlyTable rows={[row({ hour: 15, n: 12, upPct: null, nCond: 5, upPctCond: null })]} nowHour={15} events={[]} />);
  expect(screen.getByText("Дата хангалтгүй")).toBeInTheDocument();
  expect(screen.queryByText(/%/)).toBeNull();
});
test("prefers the conditional percentage and shows the sample size", () => {
  render(<HourlyTable rows={[row({ hour: 15 })]} nowHour={15} events={[]} />);
  expect(screen.getByText(/70% өсөх/)).toBeInTheDocument();
  expect(screen.getByText(/n=50/)).toBeInTheDocument();
});
test("below 50 is shown as the probability of falling", () => {
  render(<HourlyTable rows={[row({ hour: 15, upPctCond: null, nCond: 3, upPct: 42 })]} nowHour={15} events={[]} />);
  expect(screen.getByText(/58% унах/)).toBeInTheDocument();
});
test("starts at the current hour and flags hours near high-impact news", () => {
  const rows = Array.from({ length: 24 }, (_, hour) => row({ hour }));
  render(<HourlyTable rows={rows} nowHour={20} events={[{ time: new Date("2026-11-20T13:30:00Z"), title: "CPI" }]} />);
  const cells = screen.getAllByTestId("hour");
  expect(cells[0]).toHaveTextContent("20:00");
  expect(cells[23]).toHaveTextContent("19:00");
  expect(screen.getAllByTestId("news-flag")).toHaveLength(2); // 21:00 and 22:00 rows (21:30 UB ± 30 min)
});
