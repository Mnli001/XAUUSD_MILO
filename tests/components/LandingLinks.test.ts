import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const LANDING = readFileSync("src/app/(public)/page.tsx", "utf8");
const GUIDE = readFileSync("src/app/(public)/guide/vps/page.tsx", "utf8");
const FOOTER = readFileSync("src/components/Disclaimer.tsx", "utf8");

describe("landing page affordances", () => {
  it("has no arrow text that looks like a link but goes nowhere", () => {
    expect(LANDING).not.toMatch(/<span>\{t\("Дэлгэрэнгүй", "Learn more"\)\}<\/span>/);
  });

  it("the hero offers a plan first and free registration second", () => {
    expect(LANDING).toMatch(/<Link href="#plans" className="btn[^"]*">\{t\("Багц сонгох", "Choose a plan"\)\}/);
    expect(LANDING).toMatch(/<Link href="\/register" className="btn-ghost[^"]*">\{t\("Үнэгүй бүртгүүлэх", "Register free"\)\}/);
    expect(LANDING).toMatch(/id="plans"/);
  });

  it("the hero's ghost button has a dark backing so it stays readable over the moving gold", () => {
    const hero = [...LANDING.matchAll(/<Link\s+href="\/register"\s+className="btn-ghost([^"]*)"/g)].map((m) => m[1]).find((c) => /\bmin-h-14\b/.test(c));
    expect(hero).toMatch(/\bbg-zinc-950\/\d+/);
    expect(hero).toMatch(/\btext-zinc-50\b/);
  });

  it("each plan on the landing ends in a real link to registration", () => {
    const plans = LANDING.slice(LANDING.indexOf("PLAN_IDS.map"));
    expect(plans).toMatch(/<Link href="\/register" className=\{`\$\{best \? "btn" : "btn-ghost"\}/);
  });

  it("the backtest is labelled as one and the results come from the data file", () => {
    expect(LANDING).toMatch(/<BacktestResults curves=\{CURVES\} \/>/);
    expect(LANDING).toMatch(/<BacktestNote /);
  });

  it("the VPS guide is linked from the FAQ and the footer", () => {
    expect(LANDING).toMatch(/href="\/guide\/vps"/);
    expect(FOOTER).toMatch(/href="\/guide\/vps"/);
    expect(GUIDE).toMatch(/href="\/bot"/);
  });

  it("makes no claims the data cannot back", () => {
    for (const src of [LANDING, GUIDE]) expect(src).not.toMatch(/guarantee[ds]? (profit|returns)|баталгаат ашиг|testimonial|\d[\d,]* (users|traders|хэрэглэгч)/i);
  });
});
