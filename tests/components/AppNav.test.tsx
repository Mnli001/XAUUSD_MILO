// @vitest-environment jsdom
import { render, screen, within, fireEvent } from "@testing-library/react";
import { vi } from "vitest";

let path = "/journal/new";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
vi.mock("@/lib/actions/session", () => ({ logoutAction: async () => {} }));
import { AppNav } from "@/components/AppNav";

test("the section you are in is marked as current, in both the top bar and the phone tab bar", () => {
  path = "/journal/new";
  render(<AppNav name="Ану" isAdmin={false} />);
  for (const label of ["Үндсэн цэс", "Доод цэс"]) {
    const nav = screen.getByRole("navigation", { name: label });
    expect(within(nav).getByRole("link", { name: "Журнал" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Өнөөдөр" })).not.toHaveAttribute("aria-current");
  }
});
test("the phone tab bar has six destinations and the rest live in the account menu", () => {
  path = "/today";
  render(<AppNav name="Ану" isAdmin={false} />);
  expect(within(screen.getByRole("navigation", { name: "Доод цэс" })).getAllByRole("link")).toHaveLength(6);
  expect(screen.queryByRole("menu")).toBeNull(); // closed until asked for
  fireEvent.click(screen.getByRole("button", { name: /Ану/ }));
  const menu = screen.getByRole("menu");
  expect(within(menu).getByRole("menuitem", { name: "Тохиргоо" })).toHaveAttribute("href", "/settings");
  expect(within(menu).getByRole("menuitem", { name: "Гүйцэтгэл" })).toBeInTheDocument();
  expect(within(menu).getByRole("menuitem", { name: "Гарах" })).toBeInTheDocument();
  expect(within(menu).queryByRole("menuitem", { name: "Админ" })).toBeNull();
});
test("admins get the admin link in the account menu", () => {
  render(<AppNav name="Очир" isAdmin />);
  fireEvent.click(screen.getByRole("button", { name: /Очир/ }));
  expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Админ" })).toHaveAttribute("href", "/admin/users");
});
test("the glossary is one tap away in the account menu", () => {
  path = "/today";
  render(<AppNav name="Ану" isAdmin={false} />);
  fireEvent.click(screen.getByRole("button", { name: /Ану/ }));
  expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Нэр томьёо" })).toHaveAttribute("href", "/glossary");
});
