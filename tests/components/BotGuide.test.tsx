// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { BotGuide } from "@/components/BotGuide";

test("the guide names the address to allow in MT5 and links the robot file", () => {
  render(<BotGuide origin="https://example.mn" hasToken={false} online={false} />);
  expect(screen.getAllByText("https://example.mn").length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: /XauBot\.ex5/ })).toHaveAttribute("href", "/api/bot/download?file=ex5");
  expect(screen.getByText(/Allow WebRequest/)).toBeInTheDocument();
});
test("it starts open until the robot is connected, then folds away", () => {
  const { container, rerender } = render(<BotGuide origin="https://example.mn" hasToken={false} online={false} />);
  expect(container.querySelector("details")).toHaveAttribute("open");
  rerender(<BotGuide origin="https://example.mn" hasToken online />);
  expect(container.querySelector("details")).not.toHaveAttribute("open");
});
