// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { BacktestResults } from "@/components/BacktestResults";
import { BacktestHonesty, BacktestNote, KeyStats, ProofLine, RejectedIdeas, RiskLadder, YearBars, honestyText, outOfSampleText, rejectedIdeas } from "@/components/BacktestFacts";
import { PlanFeatureList, planFeatures } from "@/components/PlanFeatures";
import { CURVES, HERO_RISK, finalBalance, riskCurve, rrLabel, signedPct, signedR, underwater, usd } from "@/lib/backtestCurves";
import { existsSync } from "node:fs";
import json from "@/data/backtest-curves.json";
import { enT, mnT } from "@/lib/i18n";
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

  it("choosing the top risk shows its balance, return, CAGR and the deeper drawdown, all from the file", () => {
    const top = json.risks.at(-1)!;
    render(<BacktestResults curves={CURVES} />);
    const radio = screen.getByRole("radio", { name: new RegExp("^" + String(top.risk).replace(".", "\\.") + "%") });
    fireEvent.click(radio);
    expect(radio).toHaveAttribute("aria-checked", "true");
    const bal = usd(top.monthly.at(-1)!.eq);
    expect(screen.getByTestId("final-balance")).toHaveTextContent(bal);
    expect(screen.getByText(signedPct(top.finalPct, 0))).toBeInTheDocument();
    const t = tiles();
    expect(t).toContain(signedPct(top.cagr));
    expect(t).toContain("−" + top.maxDD.toFixed(2) + "%");
    expect(t).toContain(signedPct(top.worstMonth));
    const name = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(name).toContain(bal);
    expect(name).toContain("−" + top.maxDD + "%");
  });

  it("says what the figure is, in the same block as the figure", () => {
    render(<BacktestResults curves={CURVES} />);
    expect(screen.getByTestId("backtest-honesty")).toHaveTextContent(/Түүхэн датан дээрх backtest.*forward шалгагдаагүй/);
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
  it("the proof line quotes the start → the hero-risk balance with its drawdown, and never stands alone", () => {
    const r = riskCurve(HERO_RISK);
    render(<ProofLine t={mnT} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain(usd(CURVES.start));
    expect(text).toContain(usd(finalBalance(r)));
    expect(text).toMatch(/2019–20\d\d/);
    expect(text).toContain(HERO_RISK + "% эрсдэлтэй");
    expect(text).toContain("−" + r.maxDD.toFixed(1) + "%");
    expect(screen.getByTestId("backtest-honesty")).toHaveTextContent("forward шалгагдаагүй");
  });
  it("the honesty line quotes the file's own model when it has one, and the default differences when it does not", () => {
    const withModel = { ...CURVES, model: { positionCap: 3, swapPerOzNight: 0.25, newsFilterFrom: "2023-11-29", dataGap: ["2019-12-16", "2020-03-29"], excluded: ["commission"] } };
    expect(honestyText(mnT, withModel)).toMatch(/3 позиц.*swap \$0\.25.*2023-11-29.*COVID.*шимтгэл.*forward шалгагдаагүй/);
    expect(honestyText(enT, withModel)).toMatch(/up to 3 positions.*not forward-tested/);
    const bare = { ...withModel, model: undefined };
    expect(honestyText(mnT, bare)).toBe("Түүхэн датан дээрх backtest · live системээс ялгаатай: мэдээний шүүлтүүр, 2020 оны COVID-ийн хэсэг, swap тооцоогүй · forward шалгагдаагүй");
    render(<BacktestHonesty t={mnT} c={bare} />);
    expect(screen.getByTestId("backtest-honesty")).toHaveClass("text-sm");
  });
  it("the out-of-sample line names 2023 and that the rules were chosen on 2019–2022, from the file", () => {
    const text = outOfSampleText(mnT, CURVES as never);
    if (!(json as { outOfSample?: unknown }).outOfSample) { expect(text).toBeNull(); return; }
    const y23 = CURVES.years.find((y) => y.year === 2023)!;
    expect(text).toContain(signedR(y23.r, 2));
    expect(text).toMatch(/2019–2022/);
  });
  it("labels every backtest as a backtest, with the past-results line", () => {
    render(<BacktestNote t={mnT} />);
    expect(screen.getByText("Түүхэн датан дээрх туршилт (backtest)")).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/баталгаажуулахгүй/);
  });
  it("shows every year with its sign in text, flags the thin 2019 and marks the losing year", () => {
    render(<YearBars t={mnT} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(CURVES.years.length);
    const best = CURVES.years.reduce((x, y) => (y.r > x.r ? y : x));
    expect(screen.getByText(signedR(best.r, 2))).toBeInTheDocument();
    const thin = CURVES.years.find((y) => y.trades < 20)!;
    expect(screen.getByText(new RegExp(thin.trades + " арилжаа · өгөгдөл дутуу"))).toBeInTheDocument();
    const losing = CURVES.years.filter((y) => y.r < 0 && y.trades >= 20);
    expect(losing.length).toBeGreaterThan(0);
    for (const y of losing) {
      expect(screen.getByText(signedR(y.r, 2))).toBeInTheDocument();
      expect(screen.getByText(String(y.year)).closest("li")).toHaveAttribute("data-losing", "true");
    }
    expect(screen.getAllByText(/алдагдалтай жил/)).toHaveLength(losing.length);
  });
  it("the key stats come from the file", () => {
    render(<KeyStats t={mnT} />);
    const text = document.body.textContent ?? "";
    const s = json.stats;
    expect(text).toContain("~" + s.perWeek.toFixed(1));
    expect(text).toContain((Math.round(s.winRate * 10 + 1e-6) / 10).toFixed(1) + "%");
    expect(text).toContain("1:2–1:3");
    expect(text).toContain(s.profitFactor.toFixed(2));
  });
  it("the risk ladder lists every risk with its fall", () => {
    render(<RiskLadder t={mnT} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("уналт −" + json.risks.at(-1)!.maxDD.toFixed(1) + "%")).toBeInTheDocument();
  });
  it("what we threw away lists the 19 failed rules and the rejected shapes, and what stayed", () => {
    render(<RejectedIdeas t={mnT} />);
    expect(screen.getByRole("heading", { name: "Бид юуг туршаад хаясан бэ" })).toBeInTheDocument();
    const names = rejectedIdeas(mnT).map(([n]) => n).join(" | ");
    expect(names).toMatch(/19 дүрэм/);
    expect(names).toMatch(/Лондоны breakout/);
    expect(names).toMatch(/reversion/);
    expect(names).toMatch(/swing/);
    expect(names).toMatch(/Breakeven/);
    expect(document.body.textContent).toMatch(/Үлдсэн нь: .*3 сешний хүрээний breakout/);
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
