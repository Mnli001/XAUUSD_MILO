// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { OrderTicket } from "@/components/demo/OrderTicket";
import type { DemoView } from "@/lib/demo/view";

const view = (beginner = true): DemoView => ({
  account: { id: "acc", name: "Demo 1", leverage: 100, balance: 10_000, startBalance: 10_000, beginner, createdAt: 0 },
  state: { balance: 10_000, floating: 0, equity: 10_000, margin: 0, free: 10_000, level: null },
  positions: [], pending: [], history: [], cash: [], missions: [], price: { bid: 4000, ask: 4000.3, at: 0 },
});
const price = { bid: 4000, ask: 4000.3 };
const ticket = (v = view(), onDone = vi.fn()) => render(<OrderTicket view={v} price={price} now={0} nextHigh={null} picked={null} onDone={onDone} />);

test("the risk is worked out before the trade: a $5 stop, then 1% of the account sizes it at 0.20 lot", () => {
  ticket();
  fireEvent.click(screen.getByRole("button", { name: "$5" }));
  expect(screen.getByRole("textbox", { name: /^Stop loss/ })).toHaveValue("3995.30");
  fireEvent.click(screen.getByRole("button", { name: "1%" }));
  expect(screen.getByRole("textbox", { name: /^Lot/ })).toHaveValue("0.20");
  expect(screen.getByText("−$100.00 (1.00%)")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "1:2" }));
  expect(screen.getByRole("textbox", { name: /^Take profit/ })).toHaveValue("4010.30");
  expect(screen.getByText("1:2.00")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "BUY 0.20 @ 4,000.30" })).toBeEnabled();
});

test("a beginner's trade without a stop is held for a second press; the trade then goes out", async () => {
  const onDone = vi.fn();
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ view: view() })));
  vi.stubGlobal("fetch", fetchMock);
  ticket(view(true), onDone);
  expect(screen.getByRole("list", { name: "Анхааруулга" })).toHaveTextContent("SL тавиагүй");
  fireEvent.click(screen.getByRole("button", { name: /^SELL\s*4,000\.00/ })); // the side
  fireEvent.click(screen.getByRole("button", { name: "SELL 0.01 @ 4,000.00" }));
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Анхааруулгыг ойлгосон, нээх" }));
  await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ action: "order", account: "acc", side: "SELL", type: "MARKET", lots: 0.01, sl: null });
  vi.unstubAllGlobals();
});

test("an experienced trader's order goes out at once", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ view: view(false) })));
  vi.stubGlobal("fetch", fetchMock);
  ticket(view(false));
  fireEvent.click(screen.getByRole("button", { name: "BUY 0.01 @ 4,000.30" }));
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  vi.unstubAllGlobals();
});

test("a click on the chart below the ask makes a buy into a Buy Limit at that price", () => {
  const { rerender } = ticket();
  rerender(<OrderTicket view={view()} price={price} now={0} nextHigh={null} picked={{ price: 3990.5, n: 1 }} onDone={vi.fn()} />);
  expect(screen.getByLabelText("BUY Limit үнэ")).toHaveValue("3990.50");
  expect(screen.getByRole("button", { name: "BUY 0.01 Limit @ 3,990.50" })).toBeInTheDocument();
});

test("switching side clears a stop and target set for the other side; a wrong-side target is named, not scored", () => {
  ticket();
  fireEvent.click(screen.getByRole("button", { name: "$5" }));
  fireEvent.click(screen.getByRole("button", { name: /^SELL\s*4,000\.00/ }));
  expect(screen.getByRole("textbox", { name: /^Stop loss/ })).toHaveValue("");
  fireEvent.change(screen.getByRole("textbox", { name: /^Take profit/ }), { target: { value: "4010" } });
  expect(screen.getByRole("list", { name: "Анхааруулга" })).toHaveTextContent("TP буруу талд");
  expect(screen.queryByText(/^1:-/)).toBeNull();
});

test("a long plan drawn on the chart below the price becomes a Buy Limit with its stop and target", () => {
  const { rerender } = ticket();
  rerender(<OrderTicket view={view()} price={price} now={0} nextHigh={null} picked={null} plan={{ side: "BUY", entry: 3995, sl: 3990, tp: 4005, n: 1 }} onDone={vi.fn()} />);
  expect(screen.getByLabelText("BUY Limit үнэ")).toHaveValue("3995.00");
  expect(screen.getByRole("textbox", { name: /^Stop loss/ })).toHaveValue("3990.00");
  expect(screen.getByRole("textbox", { name: /^Take profit/ })).toHaveValue("4005.00");
});
