// @vitest-environment jsdom
import { render, screen, fireEvent, within, act, cleanup } from "@testing-library/react";
import { vi } from "vitest";
vi.mock("@/components/PrefsProvider", async () => { const { MN_VIEWER } = await import("@/lib/viewer"); return { useViewer: () => MN_VIEWER }; });
vi.mock("@/lib/actions/bot", () => ({
  saveSimpleBotAction: vi.fn(async () => ({ ok: "ok" })),
  startBotAction: vi.fn(), stopBotAction: vi.fn(), closeAllAction: vi.fn(),
  rotateTokenAction: vi.fn(async () => ({ token: "tok-123" })),
}));
import { BotPanel } from "@/components/BotPanel";
import { DEFAULT_LIVE_CONFIG, type LiveConfig } from "@/lib/bot/live";

type Props = Parameters<typeof BotPanel>[0];
const view = (o: Record<string, unknown> = {}, config: Partial<LiveConfig> = {}): Props["initial"] => ({
  account: "", accounts: [], accountServer: null, state: "STOPPED", stopReason: null, startedAt: null, stoppedAt: null, closeAllPending: false,
  config: { ...DEFAULT_LIVE_CONFIG, ...config }, hasToken: false, online: false, lastSeenAt: null,
  accountMode: null, accountLogin: null, balance: null, equity: null, currency: "USD", symbol: null, bid: null, ask: null, signal: null, reason: null, runPnl: null,
  robotVersion: null, plannedSeconds: null, elapsedSeconds: null, positions: [], gateOn: null, block: null, blockDetail: null, tradesToday: null, dayPnl: null, dailyLossHit: null,
  deals: [], dealCount: 0, pnl24h: 0, ...o,
}) as Props["initial"];
const setup = { lines: ["Ази: хүрээ 07:00–15:00", "Нью-Йорк нээлт", "Нью-Йорк орой"], record: { n: 209, winPct: 48, profitFactor: 1.44, from: "2019-01", source: "JustMarkets XAUUSD", checkedOn: "2026-11-26" } }; // i18n-ok: sample rule lines
const panel = (initial: Props["initial"]) => render(<BotPanel initial={initial} origin="https://example.mn" syncUrl="https://example.mn/api/bot/sync" robot={{ need: 13 }} setup={setup} />);
const connected = { hasToken: true, online: true, lastSeenAt: "2026-11-27T10:00:00Z", accountMode: "DEMO", accountLogin: "••••4567", balance: 2000, equity: 2010, robotVersion: 14, account: "51234567" };

test("before the robot connects, the 3 connect steps lead the page with the site address and a token button", () => {
  panel(view());
  const card = screen.getByRole("heading", { name: /Холбох — 3 алхам/ }).closest("section")!;
  expect(within(card).getByRole("link", { name: /XauBot\.ex5/ })).toHaveAttribute("href", "/api/bot/download?file=ex5");
  expect(within(card).getByText("https://example.mn")).toBeInTheDocument();
  expect(within(card).getAllByText(/Allow WebRequest/).length).toBeGreaterThan(0);
  expect(within(card).getByRole("button", { name: "Token үүсгэх" })).toBeInTheDocument();
  expect(within(card).getByText("Холболтыг хүлээж байна…")).toBeInTheDocument();
  expect(within(card).getByText("Асуудал гарвал")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Эхлүүлэх/ })).toBeDisabled();
});

test("creating a token shows it once with a Copy button and a warning", async () => {
  panel(view());
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Token үүсгэх" })); });
  expect(await screen.findByText("tok-123")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Хуулах: Token/ })).toBeInTheDocument();
  expect(screen.getByText(/хэнд ч бүү өг/)).toBeInTheDocument();
});

test("a copy button falls back to selecting the text when the clipboard is not allowed", async () => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => { throw new Error("denied"); }) }, configurable: true });
  panel(view());
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Хуулах: Site-ын хаяг/ })); });
  expect(window.getSelection()?.toString()).toBe("https://example.mn");
});

test("with a token but no robot yet, step 3 shows as half done", () => {
  panel(view({ hasToken: true }));
  expect(screen.getByText(/хагас хийгдсэн/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Шинэ token үүсгэх" })).toBeInTheDocument();
});

test("once connected the connect card is one line, and the status card shows the account", () => {
  panel(view(connected));
  expect(screen.queryByRole("heading", { name: /Холбох — 3 алхам/ })).toBeNull();
  const row = screen.getByRole("region", { name: "MT5 холболт" });
  expect(row).toHaveTextContent(/MT5 холбогдсон.*данс ••••4567/);
  expect(within(row).getByRole("button", { name: "Шинэ token үүсгэх" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Bot зогссон" })).toBeInTheDocument();
  expect(screen.getByText("$2,000.00")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Эхлүүлэх/ })).toBeEnabled();
  expect(screen.getByText("Одоогоор нээлттэй арилжаа алга.")).toBeInTheDocument();
  expect(screen.getByText("Хаагдсан арилжаа одоогоор алга.")).toBeInTheDocument();
});

test("a real account without permission says so next to Start; an old robot file asks for the new one", () => {
  panel(view({ ...connected, accountMode: "REAL", robotVersion: 12 }));
  expect(screen.getByText(/Жинхэнэ дансаар арилжаа хийхийг зөвшөөрөөгүй/)).toBeInTheDocument();
  expect(screen.getByText(/Robot-ын шинэ файлаа татаж солино уу/)).toBeInTheDocument();
});

test("the risk card offers % of balance or a fixed lot, with the dollar risk worked out from the balance", () => {
  panel(view(connected));
  expect(screen.getByLabelText(/балансын хэдэн хувийг/)).toHaveValue(1);
  expect(screen.getByText(/≈ \$20\.00 эрсдэл нэг арилжаанд/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/балансын хэдэн хувийг/), { target: { value: "2.5" } });
  expect(screen.getByText(/≈ \$50\.00 эрсдэл нэг арилжаанд/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Тогтмол lot"));
  expect(screen.getByLabelText("Нэг арилжааны lot")).toHaveValue(0.01);
  expect(screen.getByLabelText(/Жинхэнэ дансаар арилжаа хийхийг зөвшөөрөх/)).not.toBeChecked();
});

test("the page shows none of the old tools, filters or research tables", () => {
  const { container } = panel(view(connected));
  const text = container.textContent ?? "";
  expect(text).not.toMatch(/Day trader|Дүгнэлт|Багц|Орох шүүлтүүр|EMA|RSI|ATR|FVG|MSS|Backtest|аргын/);
  expect(text).toMatch(/Систем юу хийдэг вэ/);
  expect(text).toMatch(/209 арилжаа/);
});

test("a small account gets a plain note with the smallest lot's risk and the cent-account advice, in the risk card and the connect card", () => {
  panel(view({ ...connected, balance: 200, equity: 200 }));
  const notes = screen.getAllByRole("note");
  const risk = notes.find((n) => n.closest("form"))!;
  expect(risk).toHaveTextContent("Данс жижиг байна ($200.00)");
  expect(risk).toHaveTextContent("5%–10%-ийг эрсдэлд оруулна, таны сонгосон 1%-аас их");
  expect(risk).toHaveTextContent("2.5 дахинаас их бол robot тэр арилжааг алгасна");
  expect(risk).toHaveTextContent("JustMarkets Standard Cent");
  cleanup();
  panel(view({ hasToken: true, balance: 300 })); // still onboarding, but the robot has reported a balance
  const card = screen.getByRole("heading", { name: /Холбох — 3 алхам/ }).closest("section")!;
  expect(within(card).getByRole("note")).toHaveTextContent("Cent данс");
  cleanup();
  panel(view(connected)); // $2,000 at 1%: fine
  expect(screen.queryByRole("note")).toBeNull();
});
test("the robot's small-account skip reads in plain words", () => {
  panel(view({ ...connected, state: "RUNNING", block: "SMALL_ACCOUNT" }));
  expect(screen.getByText(/Одоо орохгүй байгаа шалтгаан/)).toHaveTextContent("данс жижиг");
});
