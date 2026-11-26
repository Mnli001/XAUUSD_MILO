/** How should a breakout inside a news window be treated? Site candles and stored releases.  npx tsx --env-file=.env scripts/news-mode-check.ts */
import { closeDb } from "../src/lib/db";
import { RECORD_BALANCE, ideaContext, sessionOrders } from "../src/lib/bot/ideas";
import { simulateOrders } from "../src/lib/bot/backtest";
import { DEFAULT_PARAMS } from "../src/lib/bot/strategy";
import { loadBacktestData } from "../src/lib/bot/run";
import { SESSION_RULES } from "../src/lib/setup/sessionRules";
type T = { r: number; openedAt: Date };
const st = (ts: T[]) => { let w = 0, g = 0, l = 0, s = 0, pk = 0, dd = 0; for (const { r } of [...ts].sort((a, b) => +a.openedAt - +b.openedAt)) { if (r > 0) { w++; g += r; } else l -= r; s += r; pk = Math.max(pk, s); dd = Math.max(dd, pk - s); } return `${String(ts.length).padStart(3)} tr ${(100 * w / ts.length).toFixed(0)}% avg ${(s / ts.length).toFixed(3)}R PF ${(g / l).toFixed(2)} DD ${dd.toFixed(1)}R total ${s.toFixed(1)}R`; };
async function main() {
  const data = await loadBacktestData();
  const { ctx, ready } = ideaContext(data);
  const params = { ...DEFAULT_PARAMS, breakeven: false, maxTradesPerDay: 2 };
  const firstNews = Math.min(...data.news.map((d) => d.getTime()));
  console.log(`news stored from ${new Date(firstNews).toISOString().slice(0, 10)}`);
  const half = ctx.m15[Math.floor((ready + ctx.m15.length) / 2)].time.getTime();
  for (const mode of ["wait", "skip", "ignore"] as const) {
    const all: T[] = [];
    for (const rule of SESSION_RULES) {
      const orders = sessionOrders(ctx.m15, rule, { news: ctx.news, params, trend: ctx.daily, confirm: ctx.h4, atr: ctx.atrD, onNews: mode }).map((o, i) => (i >= ready ? o : null));
      const tr = simulateOrders(ctx.m15, orders, params, RECORD_BALANCE).trades as T[];
      all.push(...tr);
      console.log(`  ${mode.padEnd(6)} ${rule.id.padEnd(17)} ${st(tr)}`);
    }
    console.log(`${mode.padEnd(8)} TOGETHER          ${st(all)} | 1st half ${st(all.filter((t) => +t.openedAt < half))} | 2nd half ${st(all.filter((t) => +t.openedAt >= half))}`);
  }
  await closeDb();
}
main();
