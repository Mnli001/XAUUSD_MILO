/**
 * Over every stored day, does the Setup page's reading of the Asian rule agree with the replay that
 * produces its record? For each day it asks the page at 20:00 UTC (after the trade is flat) what
 * happened, and compares side, entry time and result with the replayed trade.
 *   npx tsx --env-file=.env scripts/setup-replay-check.ts
 */
import { closeDb } from "../src/lib/db";
import { ASIAN_IDEA, RECORD_BALANCE, ideaContext, ideaTrades } from "../src/lib/bot/ideas";
import { loadBacktestData } from "../src/lib/bot/run";
import { asianSetup } from "../src/lib/setup/setups";

async function main() {
  const data = await loadBacktestData();
  const prepared = ideaContext(data);
  const { ctx, ready } = prepared;
  const trades = ideaTrades(prepared, ASIAN_IDEA, RECORD_BALANCE);
  const byDay = new Map(trades.map((t) => [t.openedAt.toISOString().slice(0, 10), t]));
  const m15 = data.m15;
  // the last bar of each UTC day before 20:00 is where the page's final word for that day is read
  const days = new Map<string, number>();
  m15.forEach((b, i) => { if (i >= ready && b.time.getUTCHours() < 20) days.set(b.time.toISOString().slice(0, 10), i); });

  let both = 0, onlyPage = 0, onlyReplay = 0, sideDiff = 0, outcomeDiff = 0, rDiffSum = 0;
  const samples: string[] = [];
  for (const [day, i] of days) {
    const now = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), 20));
    const from = Math.max(0, i - 199);
    const closed = m15.slice(from, i + 1);
    const s = asianSetup(closed, { daily: ctx.daily.slice(from, i + 1), h4: ctx.h4.slice(from, i + 1) }, data.news, now);
    const pageTraded = s.result !== undefined;
    const rep = byDay.get(day);
    if (pageTraded && rep) {
      both++;
      if (s.side !== rep.direction) { sideDiff++; continue; }
      const pageWin = s.result! > 0, repWin = rep.r > 0;
      rDiffSum += Math.abs(s.result! - rep.r);
      if (pageWin !== repWin) { outcomeDiff++; if (samples.length < 20) samples.push(`${day} page ${s.result!.toFixed(2)}R vs replay ${rep.r.toFixed(2)}R (${rep.reason})`); }
    } else if (pageTraded) { onlyPage++; if (samples.length < 20) samples.push(`${day} page only: ${s.side} ${s.result}R  ${s.headline}`); }
    else if (rep) { onlyReplay++; if (samples.length < 20) samples.push(`${day} replay only: ${rep.direction} ${rep.r.toFixed(2)}R (${rep.reason}), page said "${s.headline}"`); }
  }
  console.log(`days checked ${days.size} (${[...days.keys()][0]} → ${[...days.keys()].at(-1)}), replay trades ${trades.length}`);
  console.log(`both traded ${both}: side differs ${sideDiff}, win/loss differs ${outcomeDiff}, mean |ΔR| ${(rDiffSum / Math.max(1, both - sideDiff)).toFixed(3)}`);
  console.log(`page only ${onlyPage}, replay only ${onlyReplay}`);
  for (const x of samples) console.log(`  ${x}`);
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
