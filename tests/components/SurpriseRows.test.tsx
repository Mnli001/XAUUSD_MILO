// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { SurpriseRows } from "@/components/NewsList";

test("shows gold's move after beats and misses once there are a few of each", () => {
  render(<SurpriseRows stats={{ above: { n: 4, avg: -6.5, upPct: 25 }, below: { n: 1, avg: 3, upPct: 100 } }} />);
  expect(screen.getByText("Таамгаас дээш").closest("tr")).toHaveTextContent("−$6.525% өссөн4");
  expect(screen.getByText("Таамгаас доош").closest("tr")).toHaveTextContent("Түүхэн дата хангалтгүй1");
});

test("says so when there is too little", () => {
  render(<SurpriseRows stats={{ above: { n: 0, avg: null, upPct: null }, below: { n: 2, avg: 1, upPct: 50 } }} />);
  expect(screen.getByText(/цөөн байна/)).toBeInTheDocument();
});
