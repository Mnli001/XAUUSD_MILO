import { TwelveData } from "./data/twelveData";
import { FredCalendar } from "./data/fredCalendar";
import { ingestPrices } from "./ingest/prices";
import { ingestCalendar } from "./ingest/calendar";
import { runBackfill, needsBackfill } from "./ingest/backfill";
import { recomputeSnapshot, SYMBOL } from "./ingest/prices";
import { ensureAdmin } from "./users";
import { runTelegramJobs } from "./signals";
import { sendWeeklyReport, watchFeed } from "./watch";
import { sendMorningBrief } from "./brief";
import { checkPriceAlerts } from "./priceAlerts";
import { checkConditionAlerts } from "./conditionAlerts";
import { ingestMacro } from "./ingest/macro";
import { hasMacroData } from "./drivers";
import { fillActuals, recordMoves } from "./ingest/actuals";
import { runMarkets } from "./markets";
import { loadCandles as loadStored } from "./ingest/prices";
import { db, schema } from "./db";
import { and, count, eq } from "drizzle-orm";

export type Job = "fast" | "hourly" | "calendar";
/** When each job last ran: fast = the start of its quarter hour (epoch ms), hourly = "YYYY-MM-DDTHH", calendar = "YYYY-MM-DD" (UTC). */
export type SchedulerState = { fast: number | null; hourly: string | null; calendar: string | null };

const QUARTER_MS = 15 * 60 * 1000;
/** Prices are read this long after each quarter hour, when the bar that just closed is final at the provider. */
export const FAST_OFFSET_MS = 60 * 1000;

/** The quarter hour whose closed bar a run at `now` reads (its start, epoch ms). */
export const quarterOf = (now: Date) => Math.floor((now.getTime() - FAST_OFFSET_MS) / QUARTER_MS) * QUARTER_MS;

/**
 * Which jobs should start now, in the order they must run. The 15-minute job runs once per quarter hour, from one
 * minute after it (:01, :16, :31, :46), so it reads bars that have closed instead of copies of bars still forming.
 * The hourly job (1h, 4h and daily candles) runs from the same minute and BEFORE it, so a 4-hour or daily bar that
 * closed on the hour is stored before the 15-minute job reads the setups. Budget on the free price plan: 96 + 72 a day.
 */
export function dueJobs(now: Date, s: SchedulerState): Job[] {
  const iso = now.toISOString();
  const due: Job[] = [];
  if (s.hourly === null || (s.hourly !== iso.slice(0, 13) && now.getUTCMinutes() >= 1)) due.push("hourly");
  const q = quarterOf(now);
  if (s.fast === null || q > s.fast) due.push("fast");
  if (s.calendar !== iso.slice(0, 10)) due.push("calendar");
  return due;
}

async function run(job: Job, now: Date): Promise<void> {
  const priceKey = process.env.TWELVEDATA_API_KEY;
  const fredKey = process.env.FRED_API_KEY;
  if (job === "calendar") {
    if (fredKey) console.log("[scheduler] calendar", JSON.stringify(await ingestCalendar(new FredCalendar(fredKey), now)));
    // the dollar, real yields and gold futures positioning, for the drivers page (a short window once history is in)
    try { console.log("[scheduler] macro", JSON.stringify(await ingestMacro(fredKey, now, (await hasMacroData()) ? 30 : 400))); } catch (e) { console.error("[scheduler] macro failed", e); }
    return;
  }
  if (!priceKey) return;
  const result = await ingestPrices(new TwelveData(priceKey), { tfs: job === "fast" ? ["15min"] : ["1h", "4h", "1day"], now });
  if (!result.ok) console.warn(`[scheduler] ${job} failed: ${result.error}`);
  if (job === "hourly") {
    // release figures from FRED once they are out, and gold's move after each release
    try { const n = await fillActuals(fredKey, now); if (n) console.log(`[scheduler] ${n} release figure(s) filled`); } catch (e) { console.error("[scheduler] actuals failed", e); }
    try { await recordMoves(now); } catch (e) { console.error("[scheduler] release moves failed", e); }
  }
  // fresh 15-minute candles may have completed a setup, and a release may be coming: tell the people who asked to be told
  if (job === "fast") {
    const { signals, news } = await runTelegramJobs(now, result.ok);
    if (signals || news) console.log(`[scheduler] signals: ${signals} new, news alerts: ${news}`);
    // price alerts on the bar that just closed, so they still fire when no robot is sending live prices
    try {
      const [bar] = await loadStored(SYMBOL, "15min", 1);
      if (bar) { const n = await checkPriceAlerts({ high: bar.high, low: bar.low, price: bar.close, at: new Date(bar.time.getTime() + 15 * 6e4), from: bar.time }); if (n) console.log(`[scheduler] ${n} price alert(s) fired`); }
    } catch (e) { console.error("[scheduler] price alerts failed", e); }
    // silver, the euro, Nasdaq and bitcoin: hourly bars once an hour, at half past, away from gold's hourly fetch
    if (now.getUTCMinutes() >= 30 && now.getUTCMinutes() < 45) {
      try { console.log("[scheduler] markets", await runMarkets(new TwelveData(priceKey), now)); } catch (e) { console.error("[scheduler] markets failed", e); }
    }
    try { const n = await checkConditionAlerts(now); if (n) console.log(`[scheduler] ${n} condition alert(s) fired`); } catch (e) { console.error("[scheduler] condition alerts failed", e); }
    try { const f = await watchFeed(now); if (f) console.log(`[scheduler] price feed ${f}`); } catch (e) { console.error("[scheduler] feed watch failed", e); }
    try { const n = await sendWeeklyReport(now); if (n) console.log(`[scheduler] weekly report sent to ${n}`); } catch (e) { console.error("[scheduler] weekly report failed", e); }
    // 08:00 Ulaanbaatar on weekdays: the morning brief, once a day (the first 15-minute run after 00:00 UTC, after the daily bar is in)
    try { const n = await sendMorningBrief(now); if (n) console.log(`[scheduler] morning brief sent to ${n}`); } catch (e) { console.error("[scheduler] morning brief failed", e); }
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
        if (job === "fast") state.fast = quarterOf(now);
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
