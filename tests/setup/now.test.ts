import { nowWindow } from "@/lib/setup/now";
import type { SetupNow } from "@/lib/setup/setups";
import { MN_VIEWER } from "@/lib/viewer";

const base: SetupNow = { status: "OFF", side: null, headline: "h", detail: "d", entry: null, stop: null, target: null, band: null, checks: [] };
const at = (d: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, d, h, m)); // Nov 24 2026 is a Tuesday

test("while the range forms it waits for 15:00 UB and counts down to it", () => {
  const w = nowWindow({ ...base, status: "FORMING" }, at(24, 5), null, MN_VIEWER);
  expect(w.state).toBe("WAIT");
  expect(w.next?.at.toISOString()).toBe(at(24, 7).toISOString());
  expect(w.next?.in).toBe("2 цагийн дараа");
});
test("watching names the first condition not met", () => {
  const w = nowWindow({ ...base, status: "WATCH", side: "BUY", checks: [{ label: "Хүрээ бүрдсэн", ok: true }, { label: "Хүрээнээс дээш хаагдсан", ok: false }] }, at(24, 9), null, MN_VIEWER);
  expect(w).toMatchObject({ state: "WAIT", waitingFor: "Хүрээнээс дээш хаагдсан" });
});
test("in a trade it shows where it stands in R and the closing time", () => {
  const w = nowWindow({ ...base, status: "ACTIVE", side: "SELL", entry: 4006, stop: 4012, target: 3988 }, at(24, 10), 4003, MN_VIEWER);
  expect(w).toMatchObject({ state: "ENTER", liveR: 0.5 });
  expect(w.next?.at.toISOString()).toBe(at(24, 20).toISOString());
});
test("a finished day points to the next weekday's range, skipping the weekend", () => {
  const w = nowWindow({ ...base, result: 3, side: "BUY" }, at(27, 18), null, MN_VIEWER); // Friday
  expect(w.state).toBe("DONE");
  expect(w.next?.at.toISOString()).toBe(at(30, 0).toISOString()); // Monday
  expect(nowWindow(base, at(28, 12), null, MN_VIEWER).state).toBe("CLOSED");
});

test("trends apart while the entry window is open: still waiting, not 'no trade today'", () => {
  const w = nowWindow({ ...base, trends: { daily: "SELL", h4: "BUY" } }, at(24, 10, 50), null, MN_VIEWER);
  expect(w.state).toBe("WAIT");
  expect(w.waitingFor).toContain("4 цагийн trend доош эргэх");
  expect(w.next?.at.toISOString()).toBe(at(24, 12).toISOString()); // the Asian window now ends at 12:00 UTC
  expect(nowWindow({ ...base, trends: { daily: "SELL", h4: "BUY" } }, at(24, 13), null, MN_VIEWER).state).toBe("NONE"); // window shut
});

test("a New York rule points to its own next range, not the Asian one", () => {
  const ny = { rangeFrom: 12.5, rangeTo: 13.5, entryTo: 18, exitAt: at(24, 20) };
  const done = nowWindow({ ...base, result: 2, side: "BUY", window: ny }, at(24, 19), null, MN_VIEWER);
  expect(done.next?.at.toISOString()).toBe(at(25, 12, 30).toISOString());
  expect(done.next?.label).toContain("нээлтийн хүрээ");
  expect(done.next?.label).toContain("20:30");
  expect(done.next?.label).not.toContain("Азийн");
  const none = nowWindow({ ...base, window: ny }, at(24, 9), null, MN_VIEWER); // before today's range: today's is next
  expect(none.next?.at.toISOString()).toBe(at(24, 12, 30).toISOString());
  const en = nowWindow({ ...base, result: 3, side: "BUY" }, at(24, 18), null, { ...MN_VIEWER, t: (_mn: string, en: string) => en });
  expect(en.next?.label).toContain("Tomorrow's Asian range");
});
