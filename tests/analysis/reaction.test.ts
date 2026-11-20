import { eventReaction } from "@/lib/analysis/reaction";
import { buildEvents } from "../helpers/events";

test("reaction averages absolute moves and counts ups", () => {
  const { times, m15 } = buildEvents([10, 10, 10, 10, 10, 10, -10, -10]);
  const all = eventReaction(times, m15);
  expect(all.map((r) => r.minutes)).toEqual([15, 30, 60]);
  expect(all.find((x) => x.minutes === 15)).toEqual({ minutes: 15, n: 8, avgAbsMove: 10, upPct: 75 });
  expect(all.find((x) => x.minutes === 60)).toEqual({ minutes: 60, n: 8, avgAbsMove: 10, upPct: 75 });
});
test("fewer than 6 events gives nulls", () => {
  const { times, m15 } = buildEvents([10, 10, -10]);
  expect(eventReaction(times, m15)[0]).toMatchObject({ n: 3, avgAbsMove: null, upPct: null });
});
test("events without candles are skipped", () => {
  const { times, m15 } = buildEvents([10, 10, 10, 10, 10, 10, 10]);
  const r = eventReaction([...times, new Date("2030-01-01T13:30:00Z")], m15);
  expect(r[0].n).toBe(7);
});
