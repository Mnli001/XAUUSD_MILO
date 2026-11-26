import { FredCalendar } from "@/lib/data/fredCalendar";
import { nyLocalToUtc, EVENT_TYPES } from "@/lib/data/calendarProvider";
import { ProviderError } from "@/lib/data/priceProvider";
import { stubFetch } from "../helpers/fetch";

afterEach(() => vi.unstubAllGlobals());
const cpi = EVENT_TYPES.find((t) => t.type === "CPI")!;

test("New York wall time converts across daylight saving", () => {
  expect(nyLocalToUtc("2026-01-14", "08:30").toISOString()).toBe("2026-01-14T13:30:00.000Z"); // 21:30 UB
  expect(nyLocalToUtc("2026-07-14", "08:30").toISOString()).toBe("2026-07-14T12:30:00.000Z"); // 20:30 UB
  expect(nyLocalToUtc("2026-12-09", "14:00").toISOString()).toBe("2026-12-09T19:00:00.000Z");
});
test("fred adapter maps dates to typed UTC events inside the requested window", async () => {
  stubFetch(200, { release_dates: [{ release_id: 1, date: "2026-01-14" }, { release_id: 1, date: "2025-06-11" }] });
  const r = await new FredCalendar("k", [{ ...cpi, fredReleaseId: 1 }]).fetchEvents(new Date("2026-01-01"), new Date("2026-02-01"));
  expect(r).toEqual([{ type: "CPI", time: new Date("2026-01-14T13:30:00Z") }]);
});
test("types without a release id are skipped and errors surface as ProviderError", async () => {
  stubFetch(200, { release_dates: [] });
  expect(await new FredCalendar("k", [{ ...cpi, fredReleaseId: null }]).fetchEvents(new Date("2026-01-01"), new Date("2026-02-01"))).toEqual([]);
  stubFetch(400, { error_code: 400, error_message: "Bad Request" });
  await expect(new FredCalendar("k", [{ ...cpi, fredReleaseId: 1 }]).fetchEvents(new Date("2026-01-01"), new Date("2026-02-01"))).rejects.toBeInstanceOf(ProviderError);
});
test("a dropped connection is tried again before giving up", async () => {
  const { setFredPause, FRED_ATTEMPTS } = await import("@/lib/data/fredCalendar");
  setFredPause(() => 0);
  let calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    if (calls < 3) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
    return new Response(JSON.stringify({ release_dates: [{ date: "2026-01-14" }] }), { status: 200 });
  });
  const r = await new FredCalendar("k", [{ ...cpi, fredReleaseId: 1 }]).fetchEvents(new Date("2026-01-01"), new Date("2026-02-01"));
  expect(r).toHaveLength(1);
  calls = -100; // always failing now
  await expect(new FredCalendar("k", [{ ...cpi, fredReleaseId: 1 }]).fetchEvents(new Date("2026-01-01"), new Date("2026-02-01"))).rejects.toThrow(/ECONNRESET/);
  expect(FRED_ATTEMPTS).toBeGreaterThan(1);
});
test("FOMC decisions come from the Fed's schedule, at 14:00 New York", async () => {
  stubFetch(200, { release_dates: [] });
  const fomc = EVENT_TYPES.find((t) => t.type === "FOMC")!;
  const r = await new FredCalendar("k", [fomc]).fetchEvents(new Date("2026-12-01"), new Date("2027-02-01"));
  expect(r).toEqual([{ type: "FOMC", time: new Date("2026-12-09T19:00:00Z") }, { type: "FOMC", time: new Date("2027-01-27T19:00:00Z") }]);
});
