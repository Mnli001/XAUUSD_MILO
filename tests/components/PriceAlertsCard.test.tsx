// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@/lib/actions/alerts", () => ({ createPriceAlertAction: async () => ({}), deletePriceAlertAction: async () => {}, createConditionAlertAction: async () => ({}), deleteConditionAlertAction: async () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
import { PriceAlertsCard, type AlertRow } from "@/components/PriceAlertsCard";

const rows: AlertRow[] = [
  { id: "a", level: 3650, direction: "above", set: "11-27 10:00", fired: null, firedPrice: null },
  { id: "b", level: 3590, direction: "below", set: "11-27 10:01", fired: null, firedPrice: null },
  { id: "c", level: 3610, direction: "above", set: "11-26 09:00", fired: "11-26 14:12", firedPrice: 3610.4 },
];

test("waiting alerts are listed nearest first, with their direction and distance, then the ones that fired", () => {
  render(<PriceAlertsCard alerts={rows} price={3598.4} channels={{ telegram: true, push: false }} max={10} />);
  const items = within(screen.getByRole("list", { name: "Хүлээгдэж буй сэрэмжлүүлэг" })).getAllByRole("listitem");
  expect(items.map((li) => li.textContent)).toEqual([
    expect.stringContaining("3,590.00доош хүрвэл · 8.40 зайтай"),
    expect.stringContaining("3,650.00дээш хүрвэл · 51.60 зайтай"),
    expect.stringContaining("3,610.00 · хүрсэн 11-26 14:12 (3,610.40)"),
  ]);
  expect(screen.getByText("Telegram-аар ирнэ.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Утсандаа мэдэгдэл авах" })).toHaveAttribute("href", "/settings#push");
});

test("with no channel chosen it points to Settings; at the limit the Set button is disabled", () => {
  const full = Array.from({ length: 10 }, (_, i): AlertRow => ({ id: String(i), level: 3600 + i, direction: "above", set: "", fired: null, firedPrice: null }));
  render(<PriceAlertsCard alerts={full} price={3598.4} channels={{ telegram: false, push: false }} max={10} />);
  expect(screen.getByRole("link", { name: /Тохиргоонд утасны мэдэгдэл/ })).toHaveAttribute("href", "/settings#push");
  expect(screen.getByRole("button", { name: "Тавих" })).toBeDisabled();
});

test("condition alerts ask for a level only for RSI and no timeframe for yesterday's high and low", async () => {
  const { fireEvent } = await import("@testing-library/react");
  render(<PriceAlertsCard alerts={[]} price={3598.4} channels={{ telegram: true, push: true }} max={10} conditions={{ rows: [{ id: "x", label: "RSI (14) H1 30-аас доош орвол", lastFired: "11-27 10:00" }], max: 10 }} />);
  expect(screen.getByLabelText("Түвшин")).toHaveValue(30);
  expect(screen.getByLabelText("Хугацаа")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Нөхцөл"), { target: { value: "prev_high_sweep" } });
  expect(screen.queryByLabelText("Түвшин")).toBeNull();
  expect(screen.queryByLabelText("Хугацаа")).toBeNull();
  expect(within(screen.getByRole("list", { name: "Нөхцөлт сэрэмжлүүлэг" })).getByText(/сүүлд 11-27 10:00/)).toBeInTheDocument();
});
