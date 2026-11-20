import { TwelveData } from "./data/twelveData";
import { FredCalendar } from "./data/fredCalendar";
import { ingestPrices } from "./ingest/prices";
import { ingestCalendar } from "./ingest/calendar";

export type Job = "fast" | "hourly" | "calendar";
/** When each job last started: fast = epoch ms, hourly = "YYYY-MM-DDTHH", calendar = "YYYY-MM-DD" (UTC). */
export type SchedulerState = { fast: number | null; hourly: string | null; calendar: string | null };

const FAST_EVERY_MS = 5 * 60 * 1000;

/** Which jobs should start now. Budget on the free price plan: 288 + 72 requests a day. */
export function dueJobs(now: Date, s: SchedulerState): Job[] {
  const iso = now.toISOString();
  const due: Job[] = [];
  if (s.fast === null || now.getTime() - s.fast >= FAST_EVERY_MS) due.push("fast");
  if (s.hourly === null || (s.hourly !== iso.slice(0, 13) && now.getUTCMinutes() >= 2)) due.push("hourly");
  if (s.calendar !== iso.slice(0, 10)) due.push("calendar");
  return due;
}

async function run(job: Job, now: Date): Promise<void> {
  const priceKey = process.env.TWELVEDATA_API_KEY;
  const fredKey = process.env.FRED_API_KEY;
  if (job === "calendar") {
    if (fredKey) console.log("[scheduler] calendar", JSON.stringify(await ingestCalendar(new FredCalendar(fredKey), now)));
    return;
  }
  if (!priceKey) return;
  const result = await ingestPrices(new TwelveData(priceKey), { tfs: job === "fast" ? ["15min"] : ["1h", "4h", "1day"], now });
  if (!result.ok) console.warn(`[scheduler] ${job} failed: ${result.error}`);
}

let started = false;

/** In-process replacement for external cron services. Enabled with ENABLE_SCHEDULER=1 on an always-on server. */
export function startScheduler(): void {
  if (started) return;
  started = true;
  const state: SchedulerState = { fast: null, hourly: null, calendar: null };
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const now = new Date();
      for (const job of dueJobs(now, state)) {
        // mark first, so a failing job waits for its next slot instead of retrying every minute
        if (job === "fast") state.fast = now.getTime();
        else if (job === "hourly") state.hourly = now.toISOString().slice(0, 13);
        else state.calendar = now.toISOString().slice(0, 10);
        try { await run(job, now); } catch (e) { console.error(`[scheduler] ${job} error`, e); }
      }
    } finally {
      busy = false;
    }
  };
  console.log("[scheduler] started");
  setTimeout(tick, 15_000);
  setInterval(tick, 60_000);
}
