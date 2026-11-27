// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { BacktestResults } from "@/components/BacktestResults";
import { BacktestNote, KeyStats, ProofLine, RiskLadder, YearBars } from "@/components/BacktestFacts";
import { PlanFeatureList, planFeatures } from "@/components/PlanFeatures";
import { CURVES, HERO_RISK, finalBalance, riskCurve, rrLabel, signedPct, underwater, usd } from "@/lib/backtestCurves";
import { existsSync } from "node:fs";
import json from "@/data/backtest-curves.json";
import { mnT } from "@/lib/i18n";
import { MN_VIEWER } from "@/lib/viewer";
import { SignalExample, exampleSignal } from "@/components/SignalExample";
import type { SignalRow } from "@/lib/signalHistory";

const tiles = () => screen.getAllByRole("definition").map((d) => d.textContent ?? "");

describe("the backtest file", () => {
  it("ends each curve at the balance its total return gives", () => {
    for (const r of CURVES.risks) expect(Math.abs(finalBalance(r) - CURVES.start * (1 + r.finalPct / 100))).toBeLessThan(2);
  });
  it("a bigger risk makes more and also falls further", () => {
    const rs = [...CURVES.risks].sort((a, b) => a.risk - b.risk);
    for (let i = 1; i < rs.length; i++) {
      expect(rs[i].finalPct).toBeGreaterThan(rs[i - 1].finalPct);
      expect(rs[i].maxDD).toBeGreaterThan(rs[i - 1].maxDD);
      expect(rs[i].worstMonth).toBeLessThan(rs[i - 1].worstMonth);
    }
  });
  it("the underwater line never rises above zero and the targets read 1:2–1:3", () => {
    for (const r of CURVES.risks) expect(Math.max(...underwater(r.monthly))).toBeLessThanOrEqual(0);
    expect(rrLabel()).toBe("1:2–1:3");
  });
});

describe("results section", () => {
  it("opens on the hero risk with that risk's figures from the file", () => {
    render(<BacktestResults curves={CURVES} />);
    const r = json.risks.find((x) => x.risk === HERO_RISK)!;
    expect(screen.getByRole("radio", { name: /1\.5%/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("final-balance")).toHaveTextContent(usd(r.monthly.at(-1)!.eq));
    expect(screen.getByText(signedPct(r.finalPct, 0))).toBeInTheDocument();
    const t = tiles();
    expect(t).toContain(signedPct(r.cagr));
    expect(t).toContain(`−${r.maxDD.toFixed(2)}%`);
    expect(t).toContain(signedPct(r.worstMonth));
  });

  it("choosing 3% shows the 3% balance, return, CAGR and the deeper drawdown", () => {
    render(<BacktestResults curves={CURVES} />);
    fireEvent.click(screen.getByRole("radio", { name: /^3%/ }));
    expect(screen.getByRole("radio", { name: /^3%/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("final-balance")).toHaveTextContent("$23,403");
    expect(screen.getByText("+1,460%")).toBeInTheDocument();
    const t = tiles();
    expect(t).toContain("+49.25%");
    expect(t).toContain("−21.79%");
    expect(t).toContain("−11.01%");
    expect(screen.getByRole("img")).toHaveAccessibleName(/\$23,403.*−21\.79%/);
  });

  it("the risk buttons are one radio group that arrow keys move through", () => {
    render(<BacktestResults curves={CURVES} />);
    const group = screen.getByRole("radiogroup");
    expect(within(group).getAllByRole("radio")).toHaveLength(CURVES.risks.length);
    fireEvent.keyDown(screen.getByRole("radio", { name: /1\.5%/ }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: /^2%/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("final-balance")).toHaveTextContent(usd(finalBalance(riskCurve(2))));
    fireEvent.keyDown(screen.getByRole("radio", { name: /^2%/ }), { key: "Home" });
    expect(screen.getByRole("radio", { name: /^0\.5%/ })).toHaveAttribute("aria-checked", "true");
  });
});

describe("backtest facts", () => {
  it("the proof line quotes $1,500 → the 1.5% balance with its drawdown", () => {
    render(<ProofLine t={mnT} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("$1,500");
    expect(text).toContain("$6,494");
    expect(text).toMatch(/2019–2026/);
    expect(text).toMatch(/1\.5% эрсдэлтэй/);
    expect(text).toMatch(/−11\.1%/);
  });
  it("labels every backtest as a backtest, with the past-results line", () => {
    render(<BacktestNote t={mnT} />);
    expect(screen.getByText("Түүхэн датан дээрх туршилт (backtest)")).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/баталгаажуулахгүй/);
  });
  it("shows every year with its sign in text and flags the thin 2019", () => {
    render(<YearBars t={mnT} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(CURVES.years.length);
    expect(screen.getByText("−0.7R")).toBeInTheDocument();
    expect(screen.getByText("+33.1R")).toBeInTheDocument();
    expect(screen.getByText(/5 арилжаа · өгөгдөл дутуу/)).toBeInTheDocument();
  });
  it("the key stats come from the file", () => {
    render(<KeyStats t={mnT} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("~1.5");
    expect(text).toContain("50.7%");
    expect(text).toContain("1:2–1:3");
    expect(text).toContain("1.50");
  });
  it("the risk ladder lists every risk with its fall", () => {
    render(<RiskLadder t={mnT} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("уналт −21.8%")).toBeInTheDocument();
  });
});

describe("plan features", () => {
  it("lists only pages that exist in the app", () => {
    for (const f of planFeatures(mnT)) expect(existsSync(`src/app/(app)${f.href}/page.tsx`), f.href).toBe(true);
  });
  it("links each feature only when asked", () => {
    const { unmount } = render(<PlanFeatureList t={mnT} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    unmount();
    render(<PlanFeatureList t={mnT} links />);
    expect(screen.getAllByRole("link")).toHaveLength(planFeatures(mnT).length);
  });
});

describe("signal example", () => {
  const M15 = 15 * 6e4;
  const start = Date.parse("2026-11-20T00:00:00Z");
  const bars = Array.from({ length: 120 }, (_, i) => ({ time: new Date(start + i * M15), open: 2650, high: 2652 + (i % 5), low: 2648 - (i % 3), close: 2650 + (i % 4) }));
  const row = {
    id: "s1", key: "k", setupId: "asian-breakout", name: "Азийн хүрээний breakout", side: "BUY", entry: 2650, stop: 2640, target: 2680, sentTo: 3, resultSentAt: null,
    createdAt: new Date(start + 50 * M15), outcome: { kind: "WIN" as const, r: 3, at: new Date(start + 80 * M15) },
  } as unknown as SignalRow;

  it("draws the newest closed real signal as the Telegram picture", () => {
    expect(exampleSignal([{ ...row, id: "open", outcome: { kind: "OPEN", r: null, at: null } } as SignalRow, row])?.id).toBe("s1");
    render(<SignalExample row={row} bars={bars} v={MN_VIEWER} now={new Date(start + 200 * M15)} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/BUY XAUUSD.*3\.00R/);
    expect(document.querySelector("svg")).not.toBeNull();
    expect(screen.getByText(/Бодит дохио/)).toBeInTheDocument();
  });

  it("without one, shows a card that says it is an example", () => {
    render(<SignalExample row={null} bars={[]} v={MN_VIEWER} />);
    expect(document.querySelector("svg")).toBeNull();
    expect(screen.getByText(/Жишээ/)).toBeInTheDocument();
  });
});
