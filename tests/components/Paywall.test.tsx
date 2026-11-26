// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { Masked, PlansCard } from "@/components/Paywall";
import { BiasBarLocked, LevelsCardLocked } from "@/components/TodayCards";
import { ReasoningLocked } from "@/components/ReasoningPanel";
import { HourlyTable } from "@/components/HourlyTable";
import { lockedHourRows } from "@/lib/paywall";
import { mnT } from "@/lib/i18n";

test("the mask reads as ***** and tells a screen reader why", () => {
  render(<Masked t={mnT} />);
  expect(screen.getByText("*****")).toBeInTheDocument();
  expect(screen.getByText(/багц/)).toHaveClass("sr-only");
});

test("the plans card offers Plus, Pro and Max with their prices, each posting its own plan id", () => {
  const choose = vi.fn(async () => {});
  render(<PlansCard t={mnT} choose={choose} payOn contact={null} />);
  for (const [name, price, plan] of [["Plus", "50,000₮", "PLUS"], ["Pro", "150,000₮", "PRO"], ["Max", "300,000₮", "MAX"]]) {
    const card = screen.getByRole("heading", { name }).closest("li")!;
    expect(within(card).getByText(price)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /сонгох/i })).toBeEnabled();
    expect(card.querySelector('input[name="plan"]')).toHaveValue(plan);
  }
});

test("with payments not set up yet, the plans still show but cannot be bought, and the admin contact is given", () => {
  render(<PlansCard t={mnT} choose={async () => {}} payOn={false} contact={{ text: "Telegram: @admin", url: null }} />);
  for (const b of screen.getAllByRole("button", { name: /сонгох/i })) expect(b).toBeDisabled();
  expect(screen.getByText(/удахгүй/)).toBeInTheDocument();
  expect(screen.getByText("Telegram: @admin")).toBeInTheDocument();
});

test("the locked hourly table keeps every hour and its session but hides the odds and the move", () => {
  render(<HourlyTable rows={lockedHourRows()} nowHour={20} events={[]} locked />);
  expect(screen.getAllByTestId("hour")).toHaveLength(24);
  expect(screen.getAllByText("*****").length).toBe(48);
  expect(document.body.textContent).not.toMatch(/%|±\$|n=/);
});

test("locked rows carry no statistics at all", () => {
  for (const r of lockedHourRows()) expect([r.upPct, r.upPctCond, r.avgMove, r.n, r.nCond]).toEqual([null, null, null, 0, 0]);
});

test("the locked side card and levels card show only masks", () => {
  render(<><BiasBarLocked /><LevelsCardLocked /></>);
  expect(screen.getAllByText("*****").length).toBeGreaterThanOrEqual(8);
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/\d[\d,]*\.\d{2}/); // no price
  expect(text).not.toMatch(/%/); // no percentage
  expect(text).not.toMatch(/[+−-]\d/); // no signed score
  expect(screen.getAllByRole("link", { name: /Багц/ })[0]).toHaveAttribute("href", "/plans");
});

test("the locked multi-strategy read never asks the server", () => {
  const f = vi.fn();
  vi.stubGlobal("fetch", f);
  render(<ReasoningLocked />);
  expect(screen.getAllByText("*****").length).toBeGreaterThanOrEqual(6);
  expect(f).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
