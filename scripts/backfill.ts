/**
 * One-off history load.
 *   npm run backfill              — all timeframes
 *   npm run backfill -- 15min     — only the timeframes named (15min, 1h, 4h, 1day)
 * Network failures are retried; a timeframe that still fails is skipped and reported at the end.
 */
import { TwelveData } from "../src/lib/data/twelveData";
import { recomputeSnapshot, SYMBOL } from "../src/lib/ingest/prices";
import { runBackfill, BACKFILL_PLAN } from "../src/lib/ingest/backfill";
import { closeDb } from "../src/lib/db";
import { TIMEFRAMES, type Timeframe } from "../src/lib/analysis/indicators";

async function main() {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) throw new Error("TWELVEDATA_API_KEY тохируулаагүй байна");
  const wanted = process.argv.slice(2).filter((a): a is Timeframe => (TIMEFRAMES as string[]).includes(a));
  const plan = wanted.length ? BACKFILL_PLAN.filter((p) => wanted.includes(p.tf)) : BACKFILL_PLAN;
  const { failed } = await runBackfill(new TwelveData(key), { plan, log: (l) => console.log(l) });
  await recomputeSnapshot(SYMBOL, new Date());
  console.log("Snapshot тооцоолж дууслаа");
  await closeDb();
  if (failed.length) {
    console.error(`\nДутуу үлдсэн: ${failed.join(", ")}. Дахин ажиллуулах: npm run backfill -- ${failed.join(" ")}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
