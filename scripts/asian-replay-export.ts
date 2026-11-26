/**
 * Writes every replayed trade of the Asian rule as CSV (UTC date, side, entry time, R, exit reason),
 * so it can be laid next to the MT5 Strategy Tester's trades day by day.
 *   npx tsx --env-file=.env scripts/asian-replay-export.ts > asian-replay.csv
 */
import { closeDb } from "../src/lib/db";
import { ASIAN_IDEA, RECORD_BALANCE, ideaContext, ideaTrades } from "../src/lib/bot/ideas";
import { loadBacktestData } from "../src/lib/bot/run";

async function main() {
  const data = await loadBacktestData();
  const trades = ideaTrades(ideaContext(data), ASIAN_IDEA, RECORD_BALANCE);
  console.log("date,side,opened,r,reason,risk");
  for (const t of trades) {
    const risk = Math.abs(t.entryPrice - t.stopLoss);
    console.log([t.openedAt.toISOString().slice(0, 10), t.direction, t.openedAt.toISOString().slice(11, 16), t.r.toFixed(3), t.reason, risk.toFixed(2)].join(","));
  }
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
