// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { LockedCard, adminContact } from "@/components/LockedCard";
import { mnT } from "@/lib/i18n";

const noop = async () => {};

test("a newcomer is told the account exists and what happens next", () => {
  render(<LockedCard t={mnT} email="new@x.mn" contact={null} signOut={noop} />);
  expect(screen.getByText(/Бүртгэл амжилттай үүссэн/)).toBeInTheDocument();
  expect(screen.getByText(/new@x\.mn/)).toBeInTheDocument();
  // a way to check again without signing out
  expect(screen.getByRole("link", { name: /Дахин шалгах/ })).toHaveAttribute("href", "/today");
});

test("shows the admin's contact and a button to write when one is set", () => {
  render(<LockedCard t={mnT} email="new@x.mn" contact={{ text: "Telegram: @milo", url: "https://t.me/milo" }} signOut={noop} />);
  expect(screen.getByText("Telegram: @milo")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Админд бичих/ })).toHaveAttribute("href", "https://t.me/milo");
});

test("without a contact set it still explains, and shows no empty contact box", () => {
  render(<LockedCard t={mnT} email="new@x.mn" contact={null} signOut={noop} />);
  expect(screen.queryByRole("link", { name: /Админд бичих/ })).toBeNull();
});

describe("adminContact", () => {
  it("reads the text and an http(s) link", () => {
    expect(adminContact({ ADMIN_CONTACT: " Утас 99112233 ", ADMIN_CONTACT_URL: "https://m.me/milo" })).toEqual({ text: "Утас 99112233", url: "https://m.me/milo" });
  });
  it("is null when nothing is set", () => {
    expect(adminContact({})).toBeNull();
  });
  it("drops a link that is not http(s), so a bad value can never run script", () => {
    expect(adminContact({ ADMIN_CONTACT: "x", ADMIN_CONTACT_URL: "javascript:alert(1)" })).toEqual({ text: "x", url: null });
  });
  it("a link alone still gives a contact, with the link as its text", () => {
    expect(adminContact({ ADMIN_CONTACT_URL: "https://t.me/milo" })).toEqual({ text: "https://t.me/milo", url: "https://t.me/milo" });
  });
});
