import { dueJobs, quarterOf, type SchedulerState } from "@/lib/scheduler";

const fresh = (): SchedulerState => ({ fast: null, hourly: null, calendar: null });
const at = (s: string) => new Date(s);

test("everything is due on the first tick, the hourly candles before the 15-minute ones", () => {
  expect(dueJobs(at("2026-11-23T10:07:00Z"), fresh())).toEqual(["hourly", "fast", "calendar"]);
});
test("the 15-minute job runs once per quarter hour, from one minute after it", () => {
  const s = { ...fresh(), hourly: "2026-11-23T10", calendar: "2026-11-23", fast: quarterOf(at("2026-11-23T10:01:00Z")) };
  expect(dueJobs(at("2026-11-23T10:05:00Z"), s)).toEqual([]);
  expect(dueJobs(at("2026-11-23T10:15:30Z"), s)).toEqual([]); // the 10:00–10:15 bar is not final yet
  expect(dueJobs(at("2026-11-23T10:16:00Z"), s)).toEqual(["fast"]);
  expect(dueJobs(at("2026-11-23T10:29:00Z"), s)).toEqual(["fast"]); // a late tick still runs for its quarter
  expect(quarterOf(at("2026-11-23T10:16:00Z"))).toBe(at("2026-11-23T10:15:00Z").getTime());
});
test("hourly candles once per hour from minute 1, and before the 15-minute job in the same tick", () => {
  const s = { ...fresh(), fast: quarterOf(at("2026-11-23T10:46:00Z")), calendar: "2026-11-23", hourly: "2026-11-23T10" };
  expect(dueJobs(at("2026-11-23T11:00:30Z"), s)).toEqual([]);
  expect(dueJobs(at("2026-11-23T11:01:00Z"), s)).toEqual(["hourly", "fast"]);
  expect(dueJobs(at("2026-11-23T11:03:00Z"), { ...s, hourly: "2026-11-23T11", fast: quarterOf(at("2026-11-23T11:01:00Z")) })).toEqual([]);
});
test("calendar once per UTC day", () => {
  const s = { ...fresh(), fast: quarterOf(at("2026-11-24T00:10:30Z")), hourly: "2026-11-24T00", calendar: "2026-11-23" };
  expect(dueJobs(at("2026-11-24T00:11:00Z"), s)).toEqual(["calendar"]);
  expect(dueJobs(at("2026-11-24T00:11:00Z"), { ...s, calendar: "2026-11-24" })).toEqual([]);
});
