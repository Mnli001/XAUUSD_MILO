// @vitest-environment jsdom
import { render, screen, within, fireEvent } from "@testing-library/react";
import { vi } from "vitest";

let path = "/performance";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
vi.mock("@/lib/actions/session", () => ({ logoutAction: async () => {} }));
import { AppNav, currentHref } from "@/components/AppNav";

const ALL = ["Өнөөдөр", "Setup", "Чарт", "Мэдээ", "Гүйцэтгэл", "Бот", "Ботын түүх", "Багц", "Нэр томьёо", "Тохиргоо"];

test("the section you are in is marked as current, in both the rail and the phone tab bar", () => {
  path = "/performance";
  render(<AppNav name="Ану" isAdmin={false} />);
  for (const label of ["Үндсэн цэс", "Доод цэс"]) {
    const nav = screen.getByRole("navigation", { name: label });
    expect(within(nav).getByRole("link", { name: "Гүйцэтгэл" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Өнөөдөр" })).not.toHaveAttribute("aria-current");
  }
});

test("Bot history is its own page: on it, Bot history is current and Bot is not", () => {
  path = "/bot/history";
  render(<AppNav name="Ану" isAdmin={false} />);
  const rail = screen.getByRole("navigation", { name: "Үндсэн цэс" });
  expect(within(rail).getByRole("link", { name: "Ботын түүх" })).toHaveAttribute("aria-current", "page");
  expect(within(rail).getByRole("link", { name: "Бот" })).not.toHaveAttribute("aria-current");
  expect(currentHref("/bot", ["/bot", "/bot/history"])).toBe("/bot");
  expect(currentHref("/bot/history", ["/bot", "/bot/history"])).toBe("/bot/history");
  expect(currentHref("/botx", ["/bot"])).toBeNull();
});

test("on a phone, the Menu button drops down every page (there is no journal any more), and closes again", () => {
  path = "/today";
  render(<AppNav name="Ану" isAdmin={false} />);
  expect(within(screen.getByRole("navigation", { name: "Доод цэс" })).getAllByRole("link")).toHaveLength(6);
  const button = screen.getByRole("button", { name: "Цэс" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("navigation", { name: "Бүх хуудас" })).toBeNull();

  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
  const all = screen.getByRole("navigation", { name: "Бүх хуудас" });
  expect(within(all).getAllByRole("link").map((a) => a.textContent)).toEqual(ALL);
  expect(within(all).queryByRole("link", { name: "Журнал" })).toBeNull();
  expect(within(all).getByRole("link", { name: "Өнөөдөр" })).toHaveAttribute("aria-current", "page");
  expect(within(all).getByRole("link", { name: "Ботын түүх" })).toHaveAttribute("href", "/bot/history");
  expect(within(all).getByRole("button", { name: "Гарах" })).toBeInTheDocument();
  expect(within(all).queryByRole("link", { name: "Админ" })).toBeNull();

  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("navigation", { name: "Бүх хуудас" })).toBeNull();
});

test("admins also find the admin area in the phone menu and in the account menu", () => {
  path = "/today";
  render(<AppNav name="Очир" isAdmin />);
  fireEvent.click(screen.getByRole("button", { name: "Цэс" }));
  expect(within(screen.getByRole("navigation", { name: "Бүх хуудас" })).getByRole("link", { name: "Админ" })).toHaveAttribute("href", "/admin/users");
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: /Очир/ }));
  expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Админ" })).toHaveAttribute("href", "/admin/users");
});

test("the wide-screen rail lists every page, Bot history right after Bot", () => {
  path = "/today";
  render(<AppNav name="Ану" isAdmin={false} />);
  expect(within(screen.getByRole("navigation", { name: "Үндсэн цэс" })).getAllByRole("link").map((a) => a.textContent)).toEqual(ALL);
});
