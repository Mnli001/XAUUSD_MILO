// @vitest-environment jsdom
import { render, screen, within, fireEvent } from "@testing-library/react";
import { vi } from "vitest";

let path = "/performance";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
vi.mock("@/lib/actions/session", () => ({ logoutAction: async () => {} }));
import { AppNav, currentHref } from "@/components/AppNav";

const ALL = ["Өнөөдөр", "Setup", "Чарт", "Мэдээ", "Bot", "Дохионы түүх", "Макро", "Зах зээл", "Дасгал", "Журнал", "Гүйцэтгэл", "Багц", "Нэр томьёо", "Тохиргоо", "Profile"];

test("the section you are in is marked as current, in both the rail and the phone tab bar", () => {
  path = "/news";
  render(<AppNav name="Ану" isAdmin={false} />);
  for (const label of ["Үндсэн цэс", "Доод цэс"]) {
    const nav = screen.getByRole("navigation", { name: label });
    expect(within(nav).getByRole("link", { name: "Мэдээ" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Өнөөдөр" })).not.toHaveAttribute("aria-current");
  }
});

test("Signal history is its own page: on it, Signal history is current and Bot is not", () => {
  path = "/bot/history";
  render(<AppNav name="Ану" isAdmin={false} />);
  const rail = screen.getByRole("navigation", { name: "Үндсэн цэс" });
  expect(within(rail).getByRole("link", { name: "Дохионы түүх" })).toHaveAttribute("aria-current", "page");
  expect(within(rail).getByRole("link", { name: "Bot" })).not.toHaveAttribute("aria-current");
  expect(currentHref("/bot", ["/bot", "/bot/history"])).toBe("/bot");
  expect(currentHref("/bot/history", ["/bot", "/bot/history"])).toBe("/bot/history");
  expect(currentHref("/botx", ["/bot"])).toBeNull();
});

test("on a phone, the Menu button drops down every page, and closes again", () => {
  path = "/today";
  render(<AppNav name="Ану" isAdmin={false} />);
  expect(within(screen.getByRole("navigation", { name: "Доод цэс" })).getAllByRole("link")).toHaveLength(5);
  const button = screen.getByRole("button", { name: "Цэс" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("navigation", { name: "Бүх хуудас" })).toBeNull();

  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
  const all = screen.getByRole("navigation", { name: "Бүх хуудас" });
  const links = within(all).getAllByRole("link");
  expect(links.slice(0, -1).map((a) => a.textContent)).toEqual(ALL);
  expect(links.at(-1)).toHaveAttribute("href", "/profile"); // the account row: picture and name lead to the profile
  expect(within(all).getByRole("link", { name: "Журнал" })).toHaveAttribute("href", "/journal"); // the automatic one, from the robot
  expect(within(all).getByRole("link", { name: "Өнөөдөр" })).toHaveAttribute("aria-current", "page");
  expect(within(all).getByRole("link", { name: "Дохионы түүх" })).toHaveAttribute("href", "/bot/history");
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

test("the wide-screen rail lists every page, Signal history right after Bot", () => {
  path = "/today";
  render(<AppNav name="Ану" isAdmin={false} />);
  expect(within(screen.getByRole("navigation", { name: "Үндсэн цэс" })).getAllByRole("link").map((a) => a.textContent)).toEqual(ALL);
});

test("the phone tab bar holds five tabs; Performance lives in the menu", () => {
  path = "/today";
  render(<AppNav name="Ану" isAdmin={false} />);
  const bar = screen.getByRole("navigation", { name: "Доод цэс" });
  expect(within(bar).getAllByRole("link").map((a) => a.textContent)).toEqual(["Өнөөдөр", "Setup", "Чарт", "Мэдээ", "Bot"]);
  fireEvent.click(screen.getByRole("button", { name: "Цэс" }));
  expect(within(screen.getByRole("navigation", { name: "Бүх хуудас" })).getByRole("link", { name: "Гүйцэтгэл" })).toHaveAttribute("href", "/performance");
});

test("the account row shows the profile picture when there is one and leads to the profile", () => {
  path = "/today";
  const { container } = render(<AppNav name="Ану" isAdmin={false} avatar="/api/avatar?v=1" />);
  expect(container.querySelector('img[src="/api/avatar?v=1"]')).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Ану/ }));
  expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveAttribute("href", "/profile");
});
