/** What the Setup page shows right now, and each rule's replayed record:  npx tsx --env-file=.env scripts/setup-check.ts */
import { getSetups } from "../src/lib/setup/build";
import { closeDb } from "../src/lib/db";
import { viewer } from "../src/lib/viewer";

async function main() {
  const v = viewer({ locale: "en", timeZone: "Asia/Ulaanbaatar" });
  const now = new Date();
  const s = await getSetups(now, v);
  console.log(`now ${now.toISOString()}  last candle ${s.lastCandleAt?.toISOString()}  history from ${s.historyFrom?.toISOString().slice(0, 10)}`);
  for (const x of s.setups) {
    console.log(`\n${x.name}: ${x.status} ${x.side ?? ""}  ${x.headline}`);
    console.log(`  entry ${x.entry?.toFixed(2)} stop ${x.stop?.toFixed(2)} target ${x.target?.toFixed(2)}${x.at ? ` at ${x.at.toISOString()}` : ""}`);
    console.log(`  record all:    ${JSON.stringify(x.history)}`);
    console.log(`  record recent: ${JSON.stringify(x.recent)}`);
  }
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
