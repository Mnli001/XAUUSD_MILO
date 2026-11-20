import { dueJobs, type SchedulerState } from "@/lib/scheduler";

const fresh = (): SchedulerState => ({ fast: null, hourly: null, calendar: null });
const at = (s: string) => new Date(s);

test("everything is due on the first tick", () => {
  expect(dueJobs(at("2026-11-23T10:07:00Z"), fresh())).toEqual(["fast", "hourly", "calendar"]);
});
test("fast prices every 5 minutes", () => {
  const s = { ...fresh(), hourly: "2026-11-23T10", calendar: "2026-11-23", fast: at("2026-11-23T10:00:00Z").getTime() };
  expect(dueJobs(at("2026-11-23T10:04:00Z"), s)).toEqual([]);
  expect(dueJobs(at("2026-11-23T10:05:00Z"), s)).toEqual(["fast"]);
});
test("hourly candles once per hour, from minute 2", () => {
  const s = { ...fresh(), fast: at("2026-11-23T11:00:30Z").getTime(), calendar: "2026-11-23", hourly: "2026-11-23T10" };
  expect(dueJobs(at("2026-11-23T11:01:00Z"), s)).toEqual([]);
  expect(dueJobs(at("2026-11-23T11:02:00Z"), s)).toEqual(["hourly"]);
  expect(dueJobs(at("2026-11-23T11:30:00Z"), { ...s, hourly: "2026-11-23T11" })).toEqual([]);
});
test("calendar once per UTC day", () => {
  const s = { ...fresh(), fast: at("2026-11-24T00:10:30Z").getTime(), hourly: "2026-11-24T00", calendar: "2026-11-23" };
  expect(dueJobs(at("2026-11-24T00:11:00Z"), s)).toEqual(["calendar"]);
  expect(dueJobs(at("2026-11-24T00:11:00Z"), { ...s, calendar: "2026-11-24" })).toEqual([]);
});
