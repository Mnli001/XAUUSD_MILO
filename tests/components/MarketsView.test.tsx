// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { MarketCards } from "@/components/MarketsView";
import { MN_VIEWER } from "@/lib/viewer";
import type { MarketView } from "@/lib/markets";

const view = (o: Partial<MarketView> = {}): MarketView => ({
  price: 1.08421, changePct: -0.42, scores: { "1h": 40, "4h": -10, "1day": null }, bias: { total: 12, buyerPct: 56, label: "ТОДОРХОЙГҮЙ" }, // i18n-ok: stored key
  prevHigh: 1.0871, prevLow: 1.0803, atr: 0.0061, updatedAt: new Date("2026-11-27T05:00:00Z"), ...o,
});

test("a card per instrument: price in its own decimals, the day's change, direction per timeframe", () => {
  render(<MarketCards v={MN_VIEWER} selected="EURUSD" items={[{ symbol: "EURUSD", view: view() }, { symbol: "BTCUSD", view: null }]} />);
  const eur = screen.getByRole("link", { name: /Евро \/ доллар/ });
  expect(eur).toHaveAttribute("href", "/markets?s=EURUSD#chart");
  expect(eur).toHaveAttribute("aria-current", "true");
  expect(eur).toHaveTextContent("1.08421");
  expect(eur).toHaveTextContent("−0.42%");
  expect(within(eur).getByText("1H").parentElement).toHaveTextContent("↑");
  expect(within(eur).getByText("D1").parentElement).toHaveTextContent("—");
  expect(screen.getByRole("link", { name: /Bitcoin/ })).toHaveTextContent("Өгөгдөл хараахан ирээгүй");
});
