// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

const nav = vi.hoisted(() => ({ path: "/settings" as string | null, refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ refresh: nav.refresh, replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/actions/telegram", () => {
  const noop = async () => ({});
  return { linkTelegramAction: async () => ({ link: "https://t.me/xau_bot?start=abc" }), testTelegramAction: noop, unlinkTelegramAction: noop, confirmTelegramAction: noop, rejectTelegramAction: noop };
});
import { LINK_POLL_MS, TelegramCard, WAIT_MS } from "@/components/TelegramCard";

beforeEach(() => { nav.path = "/settings"; nav.refresh.mockClear(); });

test("while the bot is not set up, users do not see the card and the admin sees the steps", () => {
  const { container, rerender } = render(<TelegramCard configured={false} linked={false} isAdmin={false} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<TelegramCard configured={false} linked={false} isAdmin />);
  expect(screen.getByText(/TELEGRAM_BOT_TOKEN/)).toBeInTheDocument();
});

test("without a plan it says signals come with a plan, and linking still works", () => {
  render(<TelegramCard configured linked={false} isAdmin={false} paid={false} />);
  expect(screen.getByText(/Дохионууд багцтай хэрэглэгчдэд ирнэ/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Telegram холбох" })).toBeInTheDocument();
});

test("the card is the #telegram anchor that the payment page and the start guide link to", () => {
  const { container } = render(<TelegramCard configured linked={false} isAdmin={false} />);
  expect(container.querySelector("section#telegram")).not.toBeNull();
});

test("in full only on Settings and the Robot page; elsewhere a one-line chip to Settings", () => {
  nav.path = "/setup";
  const { container, rerender } = render(<TelegramCard configured linked={false} isAdmin={false} />);
  expect(container.querySelector("section#telegram")).toBeNull();
  expect(screen.getByTestId("telegram-chip")).toHaveTextContent("Telegram ботоор");
  expect(screen.getByRole("link", { name: /Холбох/ })).toHaveAttribute("href", "/settings#telegram");
  rerender(<TelegramCard configured linked isAdmin={false} />);
  expect(screen.getByTestId("telegram-chip")).toHaveTextContent("холбогдсон");
  nav.path = "/bot";
  rerender(<TelegramCard configured linked={false} isAdmin={false} />);
  expect(container.querySelector("section#telegram")).not.toBeNull();
  nav.path = "/setup";
  rerender(<TelegramCard configured linked={false} isAdmin={false} variant="full" />);
  expect(container.querySelector("section#telegram")).not.toBeNull();
});

test("after Link Telegram it checks for the link by itself, never asks to refresh, and stops after three minutes", async () => {
  vi.useFakeTimers();
  render(<TelegramCard configured linked={false} isAdmin={false} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Telegram холбох" })); await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByRole("link", { name: "Telegram нээж Start дарах" })).toHaveAttribute("href", "https://t.me/xau_bot?start=abc");
  expect(document.body.textContent).not.toMatch(/шинэчлээрэй|refresh this page/);
  expect(screen.getByRole("status")).toHaveTextContent("өөрөө шинэчлэгдэнэ");
  await act(async () => { await vi.advanceTimersByTimeAsync(LINK_POLL_MS * 3 + 10); });
  expect(nav.refresh).toHaveBeenCalledTimes(3);
  await act(async () => { await vi.advanceTimersByTimeAsync(WAIT_MS + LINK_POLL_MS * 2); });
  const calls = nav.refresh.mock.calls.length;
  expect(calls).toBeLessThanOrEqual(WAIT_MS / LINK_POLL_MS);
  await act(async () => { await vi.advanceTimersByTimeAsync(LINK_POLL_MS * 5); });
  expect(nav.refresh.mock.calls.length).toBe(calls); // stopped
  expect(screen.getByRole("button", { name: "дахин шалгах" })).toBeInTheDocument();
  vi.useRealTimers();
});
