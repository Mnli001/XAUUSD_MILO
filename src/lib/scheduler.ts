import { TwelveData } from "./data/twelveData";
import { FredCalendar } from "./data/fredCalendar";
import { ingestPrices } from "./ingest/prices";
import { ingestCalendar } from "./ingest/calendar";
import { runBackfill, needsBackfill } from "./ingest/backfill";
import { recomputeSnapshot, SYMBOL } from "./ingest/prices";
import { ensureAdmin } from "./users";
import { emitSignals } from "./signals";
import { db, schema } from "./db";
import { and, count, eq } from "drizzle-orm";

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
  // fresh 15-minute candles may have completed a setup: tell the people who asked to be told
  if (job === "fast" && result.ok) {
    const sent = await emitSignals(now);
    if (sent) console.log(`[scheduler] signals: ${sent} new`);
  }
}

/** First start on an empty database: create the admin, load the price history and three years of release dates. */
export async function bootstrap(): Promise<void> {
  const admin = await ensureAdmin(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  console.log(`[bootstrap] admin: ${admin}`);
  const priceKey = process.env.TWELVEDATA_API_KEY;
  const [{ c }] = await db.select({ c: count() }).from(schema.candles).where(and(eq(schema.candles.symbol, SYMBOL), eq(schema.candles.timeframe, "15min")));
  if (!priceKey || !needsBackfill(c)) return;
  console.log("[bootstrap] loading price history, this takes about five minutes");
  const { failed } = await runBackfill(new TwelveData(priceKey), { log: (l) => console.log(`[bootstrap] ${l}`) });
  await recomputeSnapshot(SYMBOL, new Date());
  const fredKey = process.env.FRED_API_KEY;
  if (fredKey) console.log("[bootstrap] calendar", JSON.stringify(await ingestCalendar(new FredCalendar(fredKey), new Date(), 1100)));
  console.log(failed.length ? `[bootstrap] finished, missing: ${failed.join(", ")}` : "[bootstrap] finished");
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
  // history first, so the regular jobs do not compete with it for the provider's rate limit
  bootstrap()
    .catch((e) => console.error("[bootstrap] error", e))
    .finally(() => { void tick(); setInterval(tick, 60_000); });
}
