// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
vi.mock("@/components/PrefsProvider", async () => {
  const { mnT } = await import("@/lib/i18n");
  return { useT: () => mnT };
});
import { LotCalculator } from "@/components/LotCalculator";

beforeEach(() => localStorage.clear());

test("from the live setup's stop, a balance and a risk give the lot, the risk and the reward in dollars", () => {
  render(<LotCalculator stop={5} target={15} source="Азийн хүрээний breakout" />);
  expect(screen.getByLabelText(/Stop хүртэлх зай/)).toHaveValue(5);
  fireEvent.change(screen.getByLabelText(/Дансны үлдэгдэл/), { target: { value: "1000" } });
  fireEvent.change(screen.getByLabelText(/Эрсдэл/), { target: { value: "1" } });
  expect(screen.getByTestId("lots")).toHaveTextContent("0.02");
  expect(screen.getByText(/−\$10\.00/)).toBeInTheDocument();
  expect(screen.getByText(/\+\$30\.00/)).toBeInTheDocument();
  expect(screen.getByText(/Азийн хүрээний breakout/)).toBeInTheDocument();
});

test("warns when even the smallest lot risks more than chosen", () => {
  render(<LotCalculator stop={33.75} target={null} />);
  fireEvent.change(screen.getByLabelText(/Дансны үлдэгдэл/), { target: { value: "200" } });
  expect(screen.getByRole("alert")).toHaveTextContent(/0\.01 лот.*16\.88%/);
});

test("without a live setup the stop distance is typed in, and the balance is remembered on this device", () => {
  const { unmount } = render(<LotCalculator stop={null} target={null} />);
  fireEvent.change(screen.getByLabelText(/Дансны үлдэгдэл/), { target: { value: "2500" } });
  fireEvent.change(screen.getByLabelText(/Stop хүртэлх зай/), { target: { value: "10" } });
  expect(screen.getByTestId("lots")).toHaveTextContent("0.02");
  unmount();
  render(<LotCalculator stop={null} target={null} />);
  expect(screen.getByLabelText(/Дансны үлдэгдэл/)).toHaveValue(2500);
});
