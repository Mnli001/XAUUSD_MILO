// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { AccountChips, SetupsCard, type DashSetup } from "@/components/MyDashboard";
import { MN_VIEWER } from "@/lib/viewer";
import { mnT } from "@/lib/i18n";
import type { TradeSummary, BotSummary } from "@/lib/dashboard";

const v = MN_VIEWER;
const DAY = 864e5;
const now = new Date("2026-11-26T10:00:00Z");
const month: TradeSummary = { month: { closed: 4, wins: 3, losses: 1, pnl: 320.5, winRate: 75 }, allTime: { closed: 9, pnl: 410 }, open: 1 };
const bot: BotSummary = { connected: true, running: true, online: true, positions: 2, pnl24h: -12.4, account: "222" };
const setups: DashSetup[] = [
  { id: "asian-breakout", name: "Азийн хүрээний задрал", status: "ACTIVE", side: "BUY", headline: "Худалдан авах дохио", entry: 2650.5, stop: 2640, target: 2671.5 },
  { id: "trend-dip", name: "Trend-ийн уналтаас орох", status: "OFF", side: null, headline: "Өнөөдөр нөхцөл бүрдээгүй", entry: null, stop: null, target: null },
];
const chip = (name: RegExp) => screen.getAllByRole("link").find((a) => a.hasAttribute("data-chip") && name.test(a.textContent ?? "")) as HTMLElement;

test("a paid user's chips show the plan with days left, the running bot and the robot's month, each linking onward", () => {
  render(<AccountChips v={v} plan={{ kind: "active", plan: "PRO", until: new Date(now.getTime() + 142 * DAY), daysLeft: 142 }} trades={month} bot={bot} />);
  const plan = chip(/Багц/);
  expect(plan).toHaveAttribute("href", "/plans");
  expect(plan).toHaveTextContent(/Pro · 142 хоног үлдсэн/);
  expect(plan).not.toHaveTextContent(/Сунгах/);

  const b = chip(/^Бот/);
  expect(b).toHaveAttribute("href", "/bot");
  expect(b).toHaveTextContent(/Ажиллаж байна/);
  expect(b).toHaveTextContent(/2 position/);
  expect(within(b).getByText("−$12.40")).toBeInTheDocument();

  const m = chip(/Ботын 30 хоног/);
  expect(m).toHaveAttribute("href", "/performance");
  expect(within(m).getByText("+$320.50")).toBeInTheDocument();
  expect(m).toHaveTextContent(/4 арилжаа · 75% ашигтай/);
});

test("without a plan the bot chip is masked and points to the plans; the robot's own month still shows", () => {
  render(<AccountChips v={v} plan={{ kind: "none" }} trades={month} bot={null} />);
  expect(chip(/Багц алга/)).toHaveTextContent(/Багц авах/);
  const b = chip(/^Бот/);
  expect(b).toHaveAttribute("href", "/plans");
  expect(within(b).getByText("*****")).toBeInTheDocument();
  expect(b.textContent).not.toMatch(/\$|position/);
  expect(within(chip(/Ботын 30 хоног/)).getByText("+$320.50")).toBeInTheDocument();
});

test("an expired plan says so; a plan ending within a week asks to renew; an admin has full access", () => {
  const { unmount } = render(<AccountChips v={v} plan={{ kind: "expired", until: new Date("2026-11-20T00:00:00Z") }} trades={month} bot={null} />);
  expect(chip(/дууссан/)).toHaveTextContent(/Сунгах/);
  unmount();
  const r = render(<AccountChips v={v} plan={{ kind: "active", plan: "PLUS", until: new Date(now.getTime() + 3 * DAY), daysLeft: 3 }} trades={month} bot={bot} />);
  expect(chip(/Багц/)).toHaveTextContent(/Plus · 3 хоног үлдсэн · Сунгах/);
  r.unmount();
  render(<AccountChips v={v} plan={{ kind: "admin" }} trades={month} bot={bot} />);
  expect(chip(/Багц/)).toHaveTextContent(/Админ/);
});

test("no robot trades yet and an unconnected bot point to the bot page to start", () => {
  const empty: TradeSummary = { month: { closed: 0, wins: 0, losses: 0, pnl: 0, winRate: null }, allTime: { closed: 0, pnl: 0 }, open: 0 };
  render(<AccountChips v={v} plan={{ kind: "admin" }} trades={empty} bot={{ connected: false, running: false, online: false, positions: 0, pnl24h: 0, account: null }} />);
  expect(chip(/Ботын 30 хоног/)).toHaveAttribute("href", "/bot");
  expect(chip(/Ботын 30 хоног/)).toHaveTextContent(/Арилжаа хараахан алга/);
  expect(chip(/MT5 холбогдоогүй/)).toHaveTextContent(/Тохируулах/);
});

test("a bot set to run whose MT5 has gone quiet is flagged, and a stopped bot says stopped", () => {
  const { unmount } = render(<AccountChips v={v} plan={{ kind: "admin" }} trades={month} bot={{ ...bot, online: false }} />);
  expect(chip(/^Бот/)).toHaveTextContent(/MT5 холболт тасарсан/);
  unmount();
  render(<AccountChips v={v} plan={{ kind: "admin" }} trades={month} bot={{ ...bot, running: false, positions: 0 }} />);
  expect(chip(/^Бот/)).toHaveTextContent(/Зогссон/);
});

test("the setups card shows a live setup's side and levels, and an idle one's headline", () => {
  render(<SetupsCard setups={setups} t={mnT} />);
  const card = screen.getByRole("heading", { name: "Setup" }).closest("section")!;
  const active = within(card).getByText("Азийн хүрээний задрал").closest("li")!;
  expect(within(active).getByText("Идэвхтэй")).toBeInTheDocument();
  for (const p of ["2,650.50", "2,640.00", "2,671.50"]) expect(within(active).getByText(p)).toBeInTheDocument();
  const off = within(card).getByText("Trend-ийн уналтаас орох").closest("li")!;
  expect(within(off).getByText("Өнөөдөр нөхцөл бүрдээгүй")).toBeInTheDocument();
  expect(within(card).getByRole("link", { name: /Setup хуудас/ })).toHaveAttribute("href", "/setup");
});

test("without a plan the setups card is masked with no prices", () => {
  render(<SetupsCard setups={null} t={mnT} />);
  const card = screen.getByRole("heading", { name: "Setup" }).closest("section")!;
  expect(within(card).getAllByText("*****").length).toBeGreaterThan(0);
  expect(card.textContent).not.toMatch(/\d,\d{3}\.\d{2}/);
  expect(within(card).getByRole("link", { name: /Багц/ })).toHaveAttribute("href", "/plans");
});
