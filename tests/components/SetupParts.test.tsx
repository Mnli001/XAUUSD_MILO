// @vitest-environment jsdom
import { render, screen, within, fireEvent } from "@testing-library/react";
import { SetupTabs } from "@/components/SetupTabs";
import { SetupTab, SetupPanel, SetupLockedPanel, NowCard, Ladder, Checks, RecordBox } from "@/components/SetupParts";
import type { Setup } from "@/lib/setup/build";
import { MN_VIEWER } from "@/lib/viewer";
import { mnT } from "@/lib/i18n";

const v = MN_VIEWER;
const hist = { n: 41, winPct: 54, avgR: 0.32, profitFactor: 1.62 };
const base: Setup = {
  id: "ny-open-breakout", name: "Нью-Йоркийн нээлтийн breakout", rule: "Дүрмийн бүтэн текст.", history: { n: 118, winPct: 51, avgR: 0.24, profitFactor: 1.45 }, recent: hist,
  status: "ACTIVE", side: "BUY", headline: "Худалдан авах: хүрээний дээд талыг эвдэв", detail: "Хүрээнээс дээш хаагдсан.",
  entry: 3601.2, stop: 3594.8, target: 3614, band: { high: 3601.2, low: 3594.8 },
  checks: [{ label: "Өдрийн тренд өсөх", ok: true }, { label: "Мэдээний цонхноос гадна", ok: false }],
};
const candles = Array.from({ length: 8 }, (_, i) => ({ time: new Date(Date.UTC(2026, 10, 26, 12, i * 15)).toISOString(), open: 3590 + i, high: 3592 + i, low: 3589 + i, close: 3591 + i }));

test("the list shows one panel at a time and choosing another setup switches the panel", () => {
  const other: Setup = { ...base, id: "asian-breakout", name: "Азийн хүрээний breakout", status: "OFF", side: null, headline: "Өнөөдөр breakout гараагүй", entry: null, stop: null, target: null, checks: [] };
  render(<SetupTabs label="Setup" ids={["a", "b"]} tabs={[<SetupTab key="a" s={base} t={mnT} paid />, <SetupTab key="b" s={other} t={mnT} paid />]} panels={[<p key="a">Панел A</p>, <p key="b">Панел B</p>]} />);
  const [a, b] = screen.getAllByRole("tab");
  expect(a).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Панел A")).toBeVisible();
  expect(screen.getByText("Панел B")).not.toBeVisible();
  fireEvent.click(b);
  expect(b).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Панел B")).toBeVisible();
  expect(screen.getByText("Панел A")).not.toBeVisible();
  expect(within(a).getByText("Идэвхтэй")).toBeInTheDocument();
  expect(a).toHaveTextContent(/54%\+0\.32R41 арилжаа/);
});

test("without a plan a tab masks the state and the record", () => {
  render(<SetupTab s={base} t={mnT} paid={false} />);
  expect(screen.getAllByText("*****").length).toBe(2);
  expect(document.body.textContent).not.toMatch(/Идэвхтэй|%|R\b/);
});

test("the panel gives the headline, the levels with distances and R:R, the checks met and the records", () => {
  render(<SetupPanel s={base} candles={candles} v={v} best={null} records={[{ title: "Сүүлийн 12 сар", h: hist }]} />);
  expect(screen.getByRole("heading", { name: base.name })).toBeInTheDocument();
  expect(screen.getByText(base.headline)).toBeInTheDocument();
  expect(screen.getByText("+$12.80")).toBeInTheDocument();
  expect(screen.getByText("−$6.40")).toBeInTheDocument();
  expect(screen.getByText("1 : 2.0")).toBeInTheDocument();
  expect(screen.getByText(/Нөхцөл · 1\/2 биелсэн/)).toBeInTheDocument();
  expect(screen.getByText(/54% ашигтай/)).toBeInTheDocument();
  expect(screen.getByText("Дүрмийн бүтэн текст.")).toBeInTheDocument();
});

test("a trade that ended today reads as finished with its result", () => {
  render(<SetupPanel s={{ ...base, status: "OFF", result: 2 }} candles={candles} v={v} best={null} records={[]} />);
  expect(screen.getByText("Дууссан")).toBeInTheDocument();
  expect(screen.getByText(/Үр дүн: \+2\.00R · 0\.01 lot \+\$12\.80/)).toBeInTheDocument();
});

test("the locked panel keeps the name and rule but no prices, side or record", () => {
  render(<SetupLockedPanel s={base} candles={candles} v={v} />);
  expect(screen.getByRole("heading", { name: base.name })).toBeInTheDocument();
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/3,6\d\d\.\d\d|Худалдан авах|%/);
  expect(screen.getByRole("link", { name: /Багц/ })).toHaveAttribute("href", "/plans");
});

test("records too small to judge say so; the now card shows what it waits for and when", () => {
  render(<RecordBox title="Сүүлийн 12 сар" h={{ n: 12, winPct: null, avgR: null, profitFactor: null }} t={mnT} />);
  expect(screen.getByText(/Дата хангалтгүй/)).toBeInTheDocument();
  render(<NowCard w={{ state: "WAIT", title: "Хүрээ 20:45-д хаагдана", waitingFor: "15 минутын хаалт", next: { label: "Дараагийн алхам", at: new Date(), in: "36 минутын дараа" }, liveR: null }} t={mnT} />);
  expect(screen.getByRole("heading", { name: /Хүрээ 20:45-д хаагдана/ })).toBeInTheDocument();
  expect(screen.getByText("15 минутын хаалт")).toBeInTheDocument();
  expect(screen.getByText("36 минутын дараа")).toBeInTheDocument();
});

test("no entry means no ladder; no checks means no checklist", () => {
  const { container } = render(<><Ladder s={{ ...base, entry: null }} t={mnT} /><Checks s={{ ...base, checks: [] }} t={mnT} /></>);
  expect(container).toBeEmptyDOMElement();
});
