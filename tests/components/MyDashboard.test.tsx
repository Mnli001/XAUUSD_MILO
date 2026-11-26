// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { MyDashboard, type DashSetup } from "@/components/MyDashboard";
import { MN_VIEWER } from "@/lib/viewer";
import type { TradeSummary, BotSummary } from "@/lib/dashboard";

const v = MN_VIEWER;
const DAY = 864e5;
const now = new Date("2026-11-26T10:00:00Z");
const journal: TradeSummary = { month: { closed: 4, wins: 3, losses: 1, pnl: 320.5, winRate: 75 }, allTime: { closed: 9, pnl: 410 }, open: 1 };
const bot: BotSummary = { connected: true, running: true, online: true, positions: 2, pnl24h: -12.4, account: "222" };
const setups: DashSetup[] = [
  { id: "asian-breakout", name: "Азийн хүрээний задрал", status: "ACTIVE", side: "BUY", headline: "Худалдан авах дохио", entry: 2650.5, stop: 2640, target: 2671.5 },
  { id: "trend-dip", name: "Трендийн уналтаас орох", status: "OFF", side: null, headline: "Өнөөдөр нөхцөл бүрдээгүй", entry: null, stop: null, target: null },
];
const tile = (name: RegExp) => screen.getByRole("heading", { name }).closest("section, li, div[data-tile]") as HTMLElement;

test("a paid user sees the plan with days left, the month's journal result, the bot and the live setup with its levels", () => {
  render(<MyDashboard v={v} name="Бат" plan={{ kind: "active", plan: "PRO", until: new Date(now.getTime() + 142 * DAY), daysLeft: 142 }} trades={journal} bot={bot} setups={setups} />);
  expect(screen.getByText(/Сайн уу, Бат/)).toBeInTheDocument();

  const plan = tile(/Багц/);
  expect(within(plan).getByText("Pro")).toBeInTheDocument();
  expect(within(plan).getByText(/142 хоног үлдсэн/)).toBeInTheDocument();

  const j = tile(/Ботын арилжаа/);
  expect(within(j).getByText("+$320.50")).toBeInTheDocument();
  expect(within(j).getByText(/4 арилжаа/)).toBeInTheDocument();
  expect(within(j).getByText(/75%/)).toBeInTheDocument();
  expect(within(j).getByText(/1 нээлттэй/)).toBeInTheDocument();

  const b = tile(/^Бот$/);
  expect(within(b).getByText(/Ажиллаж байна/)).toBeInTheDocument();
  expect(within(b).getByText(/2 позиц/)).toBeInTheDocument();
  expect(within(b).getByText("−$12.40")).toBeInTheDocument();

  const s = tile(/Setup/);
  const active = within(s).getByText("Азийн хүрээний задрал").closest("li")!;
  expect(within(active).getByText("Идэвхтэй")).toBeInTheDocument();
  expect(within(active).getByText("2,650.50")).toBeInTheDocument();
  expect(within(active).getByText("2,640.00")).toBeInTheDocument();
  expect(within(active).getByText("2,671.50")).toBeInTheDocument();
  const off = within(s).getByText("Трендийн уналтаас орох").closest("li")!;
  expect(within(off).getByText("Өнөөдөр нөхцөл бүрдээгүй")).toBeInTheDocument();
  expect(within(s).getByRole("link", { name: /Setup/ })).toHaveAttribute("href", "/setup");
});

test("a user without a plan sees their robot's own results, but the setups and the bot are locked with no figures", () => {
  render(<MyDashboard v={v} name="Бат" plan={{ kind: "none" }} trades={journal} bot={null} setups={null} />);
  expect(within(tile(/Багц/)).getByRole("link", { name: /Багц авах/ })).toHaveAttribute("href", "/plans");
  expect(within(tile(/Ботын арилжаа/)).getByText("+$320.50")).toBeInTheDocument();
  const s = tile(/Setup/);
  expect(within(s).getAllByText("*****").length).toBeGreaterThan(0);
  expect(s.textContent).not.toMatch(/\d,\d{3}\.\d{2}/);
  expect(within(tile(/^Бот$/)).getAllByText("*****").length).toBeGreaterThan(0);
});

test("an expired plan says so and offers to renew; a plan ending within a week is flagged", () => {
  const { unmount } = render(<MyDashboard v={v} name={null} plan={{ kind: "expired", until: new Date("2026-11-20T00:00:00Z") }} trades={journal} bot={null} setups={null} />);
  expect(within(tile(/Багц/)).getByText(/дууссан/)).toBeInTheDocument();
  expect(within(tile(/Багц/)).getByRole("link", { name: /Сунгах/ })).toHaveAttribute("href", "/plans");
  unmount();
  render(<MyDashboard v={v} name={null} plan={{ kind: "active", plan: "PLUS", until: new Date(now.getTime() + 3 * DAY), daysLeft: 3 }} trades={journal} bot={bot} setups={setups} />);
  expect(within(tile(/Багц/)).getByRole("link", { name: /Сунгах/ })).toBeInTheDocument();
});

test("an admin's plan reads as full access", () => {
  render(<MyDashboard v={v} name={null} plan={{ kind: "admin" }} trades={journal} bot={bot} setups={setups} />);
  expect(within(tile(/Багц/)).getByText(/Админ/)).toBeInTheDocument();
});

test("no robot trades yet and an unconnected bot point to where to start", () => {
  const empty: TradeSummary = { month: { closed: 0, wins: 0, losses: 0, pnl: 0, winRate: null }, allTime: { closed: 0, pnl: 0 }, open: 0 };
  render(<MyDashboard v={v} name={null} plan={{ kind: "admin" }} trades={empty} bot={{ connected: false, running: false, online: false, positions: 0, pnl24h: 0, account: null }} setups={setups} />);
  expect(within(tile(/Ботын арилжаа/)).getByRole("link", { name: /Бот руу/ })).toHaveAttribute("href", "/bot");
  expect(within(tile(/^Бот$/)).getByText(/холбогдоогүй/i)).toBeInTheDocument();
  expect(within(tile(/^Бот$/)).getByRole("link", { name: /Тохируулах/ })).toHaveAttribute("href", "/bot");
});

test("a bot set to run whose MT5 has gone quiet is flagged, and a stopped bot says stopped", () => {
  const { unmount } = render(<MyDashboard v={v} name={null} plan={{ kind: "admin" }} trades={journal} bot={{ ...bot, online: false }} setups={setups} />);
  expect(within(tile(/^Бот$/)).getByText(/MT5 холболт тасарсан/)).toBeInTheDocument();
  unmount();
  render(<MyDashboard v={v} name={null} plan={{ kind: "admin" }} trades={journal} bot={{ ...bot, running: false, positions: 0 }} setups={setups} />);
  expect(within(tile(/^Бот$/)).getByText(/Зогссон/)).toBeInTheDocument();
});
