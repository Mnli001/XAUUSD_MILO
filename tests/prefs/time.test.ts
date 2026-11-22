import { describe, expect, it } from "vitest";
import { formatTime, formatDateTime, zoneDateKey, zonedToUtc, zoneHourOfUbHour } from "@/lib/time";
import { viewer, MN_VIEWER } from "@/lib/viewer";

const at = new Date(Date.UTC(2026, 10, 24, 7, 5)); // 15:05 in Ulaanbaatar, 07:05 in London, 02:05 in New York

describe("times in a chosen zone", () => {
  it("formats the clock time and the date in that zone", () => {
    expect(formatTime(at, "Asia/Ulaanbaatar")).toBe("15:05");
    expect(formatTime(at, "Europe/London")).toBe("07:05");
    expect(formatTime(at, "America/New_York")).toBe("02:05");
    expect(formatDateTime(at, "Asia/Kolkata")).toBe("2026-11-24 12:35");
    expect(zoneDateKey(new Date(Date.UTC(2026, 10, 24, 20, 0)), "Asia/Ulaanbaatar")).toBe("2026-11-25");
    expect(zoneDateKey(new Date(Date.UTC(2026, 10, 24, 20, 0)), "America/New_York")).toBe("2026-11-24");
  });
  it("turns a wall-clock time in a zone back into the instant, across daylight saving", () => {
    expect(zonedToUtc("2026-11-24", "15:05", "Asia/Ulaanbaatar").toISOString()).toBe("2026-11-24T07:05:00.000Z");
    expect(zonedToUtc("2026-07-01", "09:30", "Europe/London").toISOString()).toBe("2026-07-01T08:30:00.000Z");
    expect(zonedToUtc("2026-01-15", "09:30", "America/New_York").toISOString()).toBe("2026-01-15T14:30:00.000Z");
  });
  it("relabels an Ulaanbaatar hour bucket for another zone", () => {
    expect(zoneHourOfUbHour(15, "Asia/Ulaanbaatar", at)).toBe("15:00");
    expect(zoneHourOfUbHour(15, "Europe/London", at)).toBe("07:00");
    expect(zoneHourOfUbHour(15, "Asia/Kolkata", at)).toBe("12:30");
    expect(zoneHourOfUbHour(3, "America/New_York", at)).toBe("14:00");
  });
});

describe("viewer", () => {
  it("carries the language, the zone and a short zone label", () => {
    const en = viewer({ locale: "en", timeZone: "Europe/London" });
    expect(en.t("Журнал", "Journal")).toBe("Journal");
    expect(en.time(at)).toBe("07:05");
    expect(en.dateTime(at)).toBe("2026-11-24 07:05");
    expect(en.zone).toBe("London");
    expect(viewer({ locale: "en", timeZone: "Asia/Ulaanbaatar" }).zone).toBe("UB");
    expect(viewer({ locale: "en", timeZone: "America/Argentina/Buenos_Aires" }).zone).toBe("Buenos Aires");
    expect(MN_VIEWER.zone).toBe("УБ");
    expect(MN_VIEWER.time(at)).toBe("15:05");
  });
});
