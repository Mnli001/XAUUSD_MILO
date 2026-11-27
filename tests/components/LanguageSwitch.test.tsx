// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@/lib/actions/session", () => ({ setLocaleAction: async () => {} }));
import { LanguageSwitch } from "@/components/LanguageSwitch";

const details = () => screen.getByText((_, el) => el?.tagName === "SUMMARY").closest("details") as HTMLDetailsElement;

test("the icon-only switch is a single 'Language' button showing no language name, with all twenty languages behind it", () => {
  render(<LanguageSwitch locale="de" iconOnly />);
  const summary = screen.getByLabelText("Language");
  expect(summary.tagName).toBe("SUMMARY");
  expect(summary).toHaveAttribute("title", "Language · Deutsch");
  expect(within(summary).queryByText("Deutsch")).toBeNull();
  const buttons = within(details()).getAllByRole("button", { hidden: true });
  expect(buttons).toHaveLength(20);
  expect(buttons.find((b) => b.getAttribute("aria-pressed") === "true")).toHaveTextContent("Deutsch");
});

test("the list closes on a click outside it and on Escape", () => {
  render(<div><p>outside</p><LanguageSwitch locale="mn" iconOnly /></div>);
  const d = details();
  d.open = true;
  fireEvent.pointerDown(screen.getByText("outside"));
  expect(d.open).toBe(false);
  d.open = true;
  fireEvent.keyDown(document, { key: "Escape" });
  expect(d.open).toBe(false);
});

test("a click inside the list leaves it open", () => {
  render(<LanguageSwitch locale="mn" iconOnly />);
  const d = details();
  d.open = true;
  fireEvent.pointerDown(within(d).getAllByRole("button", { hidden: true })[0]);
  expect(d.open).toBe(true);
});

test("the full switch still names the current language", () => {
  render(<LanguageSwitch locale="ja" />);
  expect(within(screen.getByLabelText("Language")).getByText("日本語")).toBeInTheDocument();
});
