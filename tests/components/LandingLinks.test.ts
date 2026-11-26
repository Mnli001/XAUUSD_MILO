import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const LANDING = readFileSync("src/app/(public)/page.tsx", "utf8");

describe("landing page affordances", () => {
  it("has no arrow text that looks like a link but goes nowhere", () => {
    expect(LANDING).not.toMatch(/<span>\{t\("Дэлгэрэнгүй", "Learn more"\)\}<\/span>/);
  });

  it("each feature card ends in a real link to registration", () => {
    const cards = LANDING.slice(LANDING.indexOf("stops(t).map"));
    expect(cards).toMatch(/<Link\s+href="\/register"[^>]*>\s*<span>\{t\("Бүртгүүлээд үзэх", "Register to see it"\)\}/);
  });

  it("the hero sign-in button has a dark backing so it stays readable over the moving gold", () => {
    const hero = [...LANDING.matchAll(/<Link\s+href="\/login"\s+className="btn-ghost([^"]*)"/g)].map((m) => m[1]).find((c) => /\bmin-h-14\b/.test(c));
    expect(hero).toMatch(/\bbg-zinc-950\/\d+/);
    expect(hero).toMatch(/\btext-zinc-50\b/);
  });
});
