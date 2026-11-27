// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { TermHint } from "@/components/TermHint";

test("a tap on the question mark opens a plain explanation that works without a mouse", () => {
  render(<p>Daily <TermHint id="atr" /></p>);
  const btn = screen.getByRole("button", { name: "ATR гэж юу вэ?" });
  expect(btn).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(btn);
  expect(btn).toHaveAttribute("aria-expanded", "true");
  const box = screen.getByRole("dialog", { name: "ATR" });
  expect(box).toHaveTextContent(/дундаж хөдөлгөөн/);
  expect(screen.getByRole("link", { name: /Бүх нэр томьёо/ })).toHaveAttribute("href", "/glossary#atr");
});

test("Escape closes it", () => {
  render(<TermHint id="lot" />);
  fireEvent.click(screen.getByRole("button", { name: /Lot/ }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("a tap anywhere else closes it", () => {
  render(<div><TermHint id="lot" /><span>elsewhere</span></div>);
  fireEvent.click(screen.getByRole("button", { name: /Lot/ }));
  fireEvent.pointerDown(screen.getByText("elsewhere"));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("can show the term itself as the button text", () => {
  render(<TermHint id="profit-factor" showTerm />);
  expect(screen.getByRole("button", { name: "Profit factor гэж юу вэ?" })).toHaveTextContent("Profit factor");
});
