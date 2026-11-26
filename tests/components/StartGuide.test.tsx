// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { StartGuide } from "@/components/StartGuide";
import { mnT } from "@/lib/i18n";

test("a newcomer gets the steps in order, where the words are explained, and a way to put it away", () => {
  render(<StartGuide t={mnT} dismiss={async () => {}} />);
  const steps = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(steps).toHaveLength(4);
  expect(steps[0]).toHaveTextContent(/Өнөөдөр/);
  expect(steps[1]).toHaveTextContent(/Setup/);
  expect(steps[1]).toHaveTextContent(/Идэвхтэй/);
  expect(steps[2]).toHaveTextContent(/Гүйцэтгэл/);
  expect(steps[3]).toHaveTextContent(/Telegram/);
  expect(within(steps[3]).getByRole("link", { name: "Telegram холбох" })).toHaveAttribute("href", "/settings#telegram");
  expect(screen.getByRole("link", { name: /Нэр томьёо/ })).toHaveAttribute("href", "/glossary");
  expect(screen.getByRole("button", { name: "Ойлголоо" })).toBeInTheDocument();
});

test("it tells a bot user to start on a demo account", () => {
  render(<StartGuide t={mnT} dismiss={async () => {}} />);
  expect(screen.getByText(/demo/)).toBeInTheDocument();
});
