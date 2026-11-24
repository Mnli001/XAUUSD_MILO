/** Prints what the day trader sees right now and its latest setups:  npx tsx --env-file=.env scripts/day-check.ts */
import { getDayState, DAY_OPTIONS } from "../src/lib/bot/daySignal";
import { loadCandles, SYMBOL } from "../src/lib/ingest/prices";
import { findSmcSetups } from "../src/lib/analysis/smc";
import { closeDb } from "../src/lib/db";

async function main() {
  const s = await getDayState(new Date());
  console.log(`setups in the last 420 closed 15-minute candles: ${s.recent.length}; one just triggered: ${s.fresh ? "yes" : "no"}`);
  const c = await loadCandles(SYMBOL, "15min", 3000);
  const all = findSmcSetups(c, DAY_OPTIONS);
  console.log(`in the last ${c.length} candles: ${all.length} setups`);
  for (const x of all.slice(-5)) console.log(`  ${x.side} ${c[x.at].time.toISOString().slice(0, 16)}Z ${x.zone.kind} entry ${x.entry.toFixed(2)} stop $${x.risk.toFixed(1)}`);
  console.log(`last stored candle: ${c.at(-1)?.time.toISOString()}`);
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
