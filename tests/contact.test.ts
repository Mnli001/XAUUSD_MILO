import { describe, it, expect } from "vitest";
import { adminContact } from "@/lib/contact";

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
