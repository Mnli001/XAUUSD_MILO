// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@/lib/actions/risk", () => ({ saveRiskAction: async () => ({}) }));
import { RiskCard } from "@/components/RiskCard";
import { PRESETS } from "@/lib/risk";

test("shows where the account stands and fills the limits from a preset", () => {
  render(<RiskCard presets={PRESETS} view={{ login: "5001", rule: { accountSize: 10000, dailyLossPct: 2, maxLossPct: 6, profitTargetPct: null, closeOnBreach: true }, reading: { daily: { used: 170, limit: 200, pct: 85 }, max: { used: 300, limit: 600, pct: 50 }, target: null }, breach: null }} />);
  expect(screen.getByRole("meter", { name: "Өнөөдрийн алдагдал" })).toHaveAttribute("aria-valuenow", "85");
  expect(screen.getByText(/\/ \$200 · 85%/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "FTMO" }));
  expect(screen.getByLabelText("Өдрийн хязгаар (%)")).toHaveValue(5);
  expect(screen.getByLabelText("Нийт хязгаар (%)")).toHaveValue(10);
  expect(screen.getByLabelText("Ашгийн зорилт (%)")).toHaveValue(10);
});

test("a breach is said plainly", () => {
  render(<RiskCard presets={PRESETS} view={{ login: "5001", rule: null, reading: null, breach: "RISK_MAX" }} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Нийт алдагдлын хязгаарт хүрсэн");
  expect(screen.queryByRole("button", { name: "Хязгаарыг арилгах" })).toBeNull();
});
