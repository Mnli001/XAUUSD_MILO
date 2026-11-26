/** The four session rules on the site's own candles and news:  npx tsx --env-file=.env scripts/session-site-check.ts */
import { closeDb } from "../src/lib/db";
import { SESSION_IDEAS, RECORD_BALANCE, ideaContext, ideaTrades } from "../src/lib/bot/ideas";
import { loadBacktestData } from "../src/lib/bot/run";
type T = { r: number; openedAt: Date };
const st = (ts: T[], weeks: number) => { let w = 0, g = 0, l = 0, s = 0, pk = 0, dd = 0; for (const { r } of [...ts].sort((a, b) => +a.openedAt - +b.openedAt).map((x) => x)) { if (r > 0) { w++; g += r; } else l -= r; s += r; pk = Math.max(pk, s); dd = Math.max(dd, pk - s); } const nl = ts.length - w; return `${String(ts.length).padStart(3)} tr ${(ts.length / weeks).toFixed(2)}/wk ${(100 * w / ts.length).toFixed(0)}% RR 1:${(g / w / (l / nl)).toFixed(2)} avg ${(s / ts.length).toFixed(3)}R PF ${(g / l).toFixed(2)} DD ${dd.toFixed(1)}R total ${s.toFixed(1)}R`; };
async function main() {
  const data = await loadBacktestData();
  const p = ideaContext(data);
  const from = data.m15[p.ready].time.getTime(), to = data.m15.at(-1)!.time.getTime(), yr = to - 365 * 864e5;
  const wAll = (to - from) / 6048e5, wYr = 52.14;
  const all: T[] = [];
  for (const idea of SESSION_IDEAS) {
    const tr = ideaTrades(p, idea, RECORD_BALANCE);
    all.push(...tr);
    console.log(idea.name.padEnd(18), "all:", st(tr, wAll), "| last 12m:", st(tr.filter((t) => +t.openedAt >= yr), wYr));
  }
  console.log("TOGETHER".padEnd(18), "all:", st(all, wAll), "| last 12m:", st(all.filter((t) => +t.openedAt >= yr), wYr));
  await closeDb();
}
main();
