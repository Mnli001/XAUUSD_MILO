// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@/lib/actions/telegram", () => {
  const noop = async () => ({});
  return { linkTelegramAction: noop, testTelegramAction: noop, unlinkTelegramAction: noop, confirmTelegramAction: noop, rejectTelegramAction: noop };
});
import { TelegramCard } from "@/components/TelegramCard";

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
