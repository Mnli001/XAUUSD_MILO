import { SESSION_RULES } from "@/lib/setup/sessionRules";
import { exitText, recordTitle, recordYears, robotFileLabel, ruleLine, stamp, testWindows, SIGNAL_WINDOW, signalWindowLabel } from "@/lib/siteCopy";
import { MN_VIEWER, viewer } from "@/lib/viewer";

const EN = viewer({ locale: "en", timeZone: "Asia/Ulaanbaatar" });

test("each session's time exit, on the Ulaanbaatar clock", () => {
  const [asian, nyOpen, nyLate] = SESSION_RULES;
  expect(exitText(asian, EN)).toMatch(/04:00/); // 20:00 UTC
  expect(exitText(nyOpen, EN)).toMatch(/04:00/);
  expect(exitText(nyLate, EN)).toMatch(/15:00 the next day/); // 07:00 UTC the next day
  expect(exitText(nyLate, EN)).toMatch(/04:00 on a Friday/);
});

test("a rule's line carries its range, entry window and reward from SESSION_RULES", () => {
  const asian = ruleLine(SESSION_RULES[0], "Asian range breakout", EN);
  expect(asian).toMatch(/range 08:00–15:00/);
  expect(asian).toMatch(/entries 15:00–20:00/);
  expect(asian).toMatch(/3R/);
  expect(ruleLine(SESSION_RULES[1], "NY", EN)).toMatch(/range 20:30–21:30.*2R/);
});

test("robot protocol numbers read as file versions, unknown ones as nothing", () => {
  expect(robotFileLabel(13)).toBe("v3.60");
  expect(robotFileLabel(9)).toBe("v3.10");
  expect(robotFileLabel(99)).toBeNull();
});

test("the year shows only when it is not this year", () => {
  const now = new Date("2026-11-27T00:00:00Z");
  expect(stamp(MN_VIEWER, new Date("2026-11-25T11:47:00Z"), now)).toBe("11-25 19:47");
  expect(stamp(MN_VIEWER, new Date("2025-11-25T11:47:00Z"), now)).toBe("2025-11-25 19:47");
});

test("the research record's span comes from its dates, and the test windows from today", () => {
  const r = { n: 1, winPct: 1, profitFactor: 1, from: "2019-01", source: "x", checkedOn: "2026-11-26" };
  expect(recordYears(r)).toBe(8);
  expect(recordTitle(r, EN.t)).toMatch(/research.*2019-01 → 2026-11/);
  expect(recordTitle({ ...r, label: "Custom" }, EN.t)).toBe("Custom");
  expect(testWindows(new Date("2026-11-27T00:00:00Z"))).toEqual([["2024.11.27", "2025.11.27"], ["2025.11.27", "2026.11.27"]]);
});

test("one signal window, named the same everywhere", () => {
  expect(SIGNAL_WINDOW).toBe(60);
  expect(signalWindowLabel(MN_VIEWER.t)).toBe("Сүүлийн 60 дохио");
});
