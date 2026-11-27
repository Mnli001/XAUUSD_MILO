// @vitest-environment jsdom
import { render, screen, within, fireEvent } from "@testing-library/react";
import { hourCells, DirectionCard, KeyLevels, NextReleaseCard, LevelSpark, spreadLabels } from "@/components/TodayCards";
import { HourStrip } from "@/components/HourStrip";
import type { HourRow } from "@/lib/analysis/hourly";
import type { Levels, TodaySnapshot } from "@/lib/snapshot";

const row = (o: Partial<HourRow>): HourRow => ({ hour: 0, session: "Ази", n: 100, upPct: 60, nCond: 50, upPctCond: 70, avgMove: 3.2, ...o });
const levels: Levels = { p: 3602.15, r1: 3614.15, r2: 3627.15, s1: 3590.15, s2: 3577.15, atr: 9.4, prevHigh: 3620.15, prevLow: 3582.15, prevClose: 3594.1 };

test("the strip starts at the current hour, prefers the conditional odds and spells the hour out with its sample", () => {
  const rows = Array.from({ length: 24 }, (_, hour) => row({ hour }));
  render(<HourStrip cells={hourCells(rows, 20, [])} />);
  const hours = screen.getAllByTestId("hour");
  expect(hours).toHaveLength(24);
  expect(hours[0]).toHaveTextContent("20");
  expect(hours[23]).toHaveTextContent("19");
  const detail = screen.getByTestId("hour-detail");
  expect(detail).toHaveTextContent(/20:00 УБ · одоо/);
  expect(detail).toHaveTextContent(/70% өсөх/);
  expect(detail).toHaveTextContent(/n=50/);
  expect(detail).toHaveTextContent(/±\$3\.2/);
});

test("pointing at another hour shows that hour; below 50 reads as the chance of falling; all-days odds say so", () => {
  const rows = [row({ hour: 15 }), row({ hour: 16, upPctCond: null, nCond: 3, upPct: 42, n: 120 })];
  render(<HourStrip cells={hourCells(rows, 15, [])} />);
  fireEvent.mouseEnter(screen.getAllByTestId("hour-cell")[1]);
  const detail = screen.getByTestId("hour-detail");
  expect(detail).toHaveTextContent(/16:00/);
  expect(detail).toHaveTextContent(/58% унах/);
  expect(detail).toHaveTextContent(/n=120 · бүх өдөр/);
});

test("a small sample never shows a percentage", () => {
  render(<HourStrip cells={hourCells([row({ hour: 15, n: 12, upPct: null, nCond: 5, upPctCond: null })], 15, [])} />);
  expect(screen.getByTestId("hour-detail")).toHaveTextContent(/Дата хангалтгүй/);
  expect(document.body.textContent).not.toMatch(/%/);
});

test("hours within half an hour of a high-impact release carry its name", () => {
  const rows = Array.from({ length: 24 }, (_, hour) => row({ hour }));
  const cells = hourCells(rows, 20, [{ time: new Date("2026-11-20T13:30:00Z"), title: "CPI" }]); // 21:30 UB
  expect(cells.filter((c) => c.news === "CPI").map((c) => c.hour)).toEqual([21, 22]);
});

test("the direction card gives the side in words, the score, buyers against sellers and each timeframe", () => {
  const bias: TodaySnapshot["bias"] = { total: 34, buyerPct: 67, label: "ӨСӨХ хандлага", perTimeframe: { "1day": 40, "4h": -25, "1h": 10, "15min": null }, computedAt: new Date("2026-11-26T09:00:00Z") };
  render(<DirectionCard bias={bias} />);
  const card = screen.getByRole("heading", { name: /Өдрийн чиглэл/ }).closest("section")!;
  expect(within(card).getByText("Өсөх")).toBeInTheDocument();
  expect(within(card).getByText("хандлага")).toBeInTheDocument();
  expect(within(card).getByText("+34")).toBeInTheDocument();
  expect(card).toHaveTextContent(/Худалдан авагч 67%/);
  expect(card).toHaveTextContent(/Худалдагч 33%/);
  expect(within(card).getByText("−25")).toBeInTheDocument();
  expect(within(card).getByText("—")).toBeInTheDocument();
});

test("the levels list puts the price between the levels it sits between", () => {
  render(<KeyLevels levels={levels} price={3598.4} />);
  const items = screen.getAllByRole("listitem").map((li) => li.textContent);
  expect(items.map((s) => s!.replace(/\d,\d{3}\.\d{2}$/, "").trim())).toEqual(["R2", "R1", "Pivot", "Одоо", "S1", "S2"]);
  expect(screen.getByText("3,598.40")).toBeInTheDocument();
});

test("the next release names the event, its time and how gold moved after it in the past hour", () => {
  render(<NextReleaseCard next={{ time: new Date("2026-11-27T11:29:00Z"), type: "OTHER", title: "Nonfarm Payrolls" }} stats={[{ minutes: 60, n: 12, avgAbsMove: 18.2, upPct: 55 }]} />);
  expect(screen.getByRole("heading", { name: "Nonfarm Payrolls" })).toBeInTheDocument();
  expect(screen.getByText(/19:29 УБ/)).toBeInTheDocument();
  expect(screen.getByText(/Өмнөх 12 удаад: 1 цагт дунджаар ±\$18 хөдөлсөн/)).toBeInTheDocument();
});

test("the price line names today's levels only when they are given, and labels never overlap", () => {
  const closes = Array.from({ length: 96 }, (_, i) => 3550 + i / 2);
  const { container, rerender } = render(<LevelSpark closes={closes} levels={levels} />);
  expect([...container.querySelectorAll("[data-level]")].map((e) => e.getAttribute("data-level"))).toEqual(["R2", "R1", "P", "S1", "S2"]);
  rerender(<LevelSpark closes={closes} levels={null} />);
  expect(container.querySelectorAll("[data-level]")).toHaveLength(0);
  expect(spreadLabels([10, 12, 40, 41], 8)).toEqual([10, 18, 40, 48]);
});
