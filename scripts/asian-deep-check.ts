/**
 * The Asian range breakout taken apart on every stored candle: by year, by side, by half, by weekday,
 * by range width, against higher costs, and with other targets and stops, so it is clear which part
 * of the rule carries the result.   npx tsx --env-file=.env scripts/asian-deep-check.ts
 */
import { closeDb } from "../src/lib/db";
import { ASIAN_IDEA, RECORD_BALANCE, asianRangeOrders, ideaContext } from "../src/lib/bot/ideas";
import { loadBacktestData } from "../src/lib/bot/run";
import { simulateOrders, type Order } from "../src/lib/bot/backtest";
import type { BotParams } from "../src/lib/bot/strategy";

type T = { r: number; openedAt: Date; direction: string; reason: string };
const stats = (ts: T[]) => {
  let w = 0, g = 0, l = 0, sum = 0, peak = 0, dd = 0, streak = 0, worst = 0;
  for (const t of ts) {
    if (t.r > 0) { w++; g += t.r; streak = 0; } else { l -= t.r; streak++; worst = Math.max(worst, streak); }
    sum += t.r; peak = Math.max(peak, sum); dd = Math.max(dd, peak - sum);
  }
  return { n: ts.length, win: ts.length ? (w / ts.length) * 100 : 0, avg: ts.length ? sum / ts.length : 0, sum, pf: l > 0 ? g / l : Infinity, dd, worst };
};
const fmt = (s: ReturnType<typeof stats>) =>
  `${String(s.n).padStart(4)} tr  win ${s.win.toFixed(1).padStart(5)}%  avg ${(s.avg >= 0 ? "+" : "") + s.avg.toFixed(3)}R  total ${(s.sum >= 0 ? "+" : "") + s.sum.toFixed(1).padStart(5)}R  PF ${Number.isFinite(s.pf) ? s.pf.toFixed(2) : "∞"}  maxDD ${s.dd.toFixed(1)}R  worst run ${s.worst}`;
const line = (label: string, ts: T[]) => console.log(`  ${label.padEnd(34)} ${fmt(stats(ts))}`);

async function main() {
  const data = await loadBacktestData();
  const all = ideaContext(data);
  const ready = all.ctx.daily.findIndex((d) => d !== null);
  const { ctx } = all;
  const base = ASIAN_IDEA.params;
  const run = (orders: (Order | null)[], p: BotParams = base) => simulateOrders(ctx.m15, orders.map((o, i) => (i >= ready ? o : null)), p, RECORD_BALANCE).trades as T[];
  const rule = (rr: number, extra: Partial<{ trend: boolean }> = {}) => asianRangeOrders(ctx.m15, { rr, news: ctx.news, params: base, trend: extra.trend === false ? undefined : ctx.daily });

  const main = run(rule(2));
  console.log(`history ${ctx.m15[ready].time.toISOString().slice(0, 10)} → ${ctx.m15.at(-1)!.time.toISOString().slice(0, 10)}  (spread $${base.spread})\n`);
  console.log("THE RULE (RR 2, daily trend, stop at the middle):");
  line("all", main);
  const half = main[Math.floor(main.length / 2)].openedAt;
  line("first half", main.filter((t) => t.openedAt < half));
  line("second half", main.filter((t) => t.openedAt >= half));
  for (const y of [...new Set(main.map((t) => t.openedAt.getUTCFullYear()))]) line(`year ${y}`, main.filter((t) => t.openedAt.getUTCFullYear() === y));
  for (const s of ["BUY", "SELL"]) line(`side ${s}`, main.filter((t) => t.direction === s));
  for (const r of ["TP", "SL", "TIME"]) console.log(`  exits ${r}: ${main.filter((t) => t.reason === r).length}`);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let d = 1; d <= 5; d++) line(`weekday ${days[d]}`, main.filter((t) => t.openedAt.getUTCDay() === d));
  for (const [a, b] of [[7, 9], [9, 12], [12, 16]]) line(`entry ${a}:00–${b}:00 UTC`, main.filter((t) => t.openedAt.getUTCHours() >= a && t.openedAt.getUTCHours() < b));

  // range width: stop distance in dollars is half the range plus the breakout distance
  const orders = rule(2);
  const widthOf = new Map<number, number>();
  orders.forEach((o, i) => { if (o) widthOf.set(ctx.m15[i + 1]?.time.getTime() ?? 0, o.stopDist); });
  const withW = main.map((t) => ({ t, w: widthOf.get(t.openedAt.getTime()) ?? NaN })).filter((x) => Number.isFinite(x.w));
  const sorted = [...withW].sort((a, b) => a.w - b.w);
  const q = (k: number) => sorted[Math.floor((sorted.length - 1) * k)].w;
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  console.log(`\nBY STOP DISTANCE (quartiles $${q1.toFixed(1)} / $${q2.toFixed(1)} / $${q3.toFixed(1)}):`);
  line(`stop ≤ $${q1.toFixed(1)}`, withW.filter((x) => x.w <= q1).map((x) => x.t));
  line(`$${q1.toFixed(1)}–$${q2.toFixed(1)}`, withW.filter((x) => x.w > q1 && x.w <= q2).map((x) => x.t));
  line(`$${q2.toFixed(1)}–$${q3.toFixed(1)}`, withW.filter((x) => x.w > q2 && x.w <= q3).map((x) => x.t));
  line(`stop > $${q3.toFixed(1)}`, withW.filter((x) => x.w > q3).map((x) => x.t));

  console.log("\nCOSTS (spread per side):");
  for (const sp of [0.15, 0.3, 0.5, 0.8]) line(`spread $${sp}`, run(rule(2), { ...base, spread: sp }));

  console.log("\nTARGETS:");
  for (const rr of [1, 1.5, 2, 2.5, 3, 4]) {
    const ts = run(rule(rr));
    const h = ts[Math.floor(ts.length / 2)].openedAt;
    line(`RR ${rr}  (2nd half → ${stats(ts.filter((t) => t.openedAt >= h)).avg.toFixed(3)}R)`, ts);
  }

  console.log("\nFILTERS:");
  line("no trend filter", run(rule(2, { trend: false })));
  line("with daily trend (the rule)", main);
  const h4Agree = rule(2).map((o, i) => (o && ctx.h4[i] !== null && (o.side === "BUY" ? ctx.h4[i]! > 0 : ctx.h4[i]! < 0) ? o : null));
  line("daily + 4h trend agree", run(h4Agree));
  const breakeven = run(rule(2), { ...base, breakeven: true });
  line("stop to entry at +1R", breakeven);
  // Each candidate change must help in BOTH halves of history, or it is a fit to the past.
  console.log("\nCANDIDATE CHANGES, judged on each half separately (cut at the rule's middle trade):");
  const cut = half.getTime();
  const halves = (ts: T[]) => [ts.filter((t) => t.openedAt.getTime() < cut), ts.filter((t) => t.openedAt.getTime() >= cut)].map((x) => stats(x));
  const show = (label: string, ts: T[]) => { const [a, b] = halves(ts); console.log(`  ${label.padEnd(40)} 1st: ${String(a.n).padStart(3)} tr avg ${a.avg.toFixed(3)}R PF ${a.pf.toFixed(2)}  |  2nd: ${String(b.n).padStart(3)} tr avg ${b.avg.toFixed(3)}R PF ${b.pf.toFixed(2)}  | all PF ${stats(ts).pf.toFixed(2)} DD ${stats(ts).dd.toFixed(1)}R`); };
  const minPct = (pct: number, rr = 2, src = rule(rr)) => src.map((o, i) => (o && o.stopDist / ctx.m15[i].close >= pct / 100 ? o : null));
  const h4ok = (src: (Order | null)[]) => src.map((o, i) => (o && ctx.h4[i] !== null && (o.side === "BUY" ? ctx.h4[i]! > 0 : ctx.h4[i]! < 0) ? o : null));
  const h4notAgainst = (src: (Order | null)[]) => src.map((o, i) => (o && !(ctx.h4[i] !== null && (o.side === "BUY" ? ctx.h4[i]! < 0 : ctx.h4[i]! > 0)) ? o : null));
  show("the rule (RR 2)", main);
  show("4h trend agrees", run(h4ok(rule(2))));
  show("4h trend not against", run(h4notAgainst(rule(2))));
  for (const pct of [0.15, 0.2, 0.25, 0.3, 0.4]) show(`stop ≥ ${pct}% of price`, run(minPct(pct)));
  show("RR 3", run(rule(3)));
  show("RR 3 + 4h agrees", run(h4ok(rule(3))));
  for (const pct of [0.2, 0.25, 0.3]) show(`4h agrees + stop ≥ ${pct}%`, run(h4ok(minPct(pct))));
  for (const pct of [0.2, 0.25, 0.3]) show(`4h not against + stop ≥ ${pct}%`, run(h4notAgainst(minPct(pct))));
  show("RR 3 + 4h agrees + stop ≥ 0.25%", run(h4ok(minPct(0.25, 3))));
  const firstH4 = ctx.h4.findIndex((x) => x !== null);
  console.log(`  (4-hour trend readings exist from ${ctx.m15[firstH4].time.toISOString().slice(0, 10)}; before that the 4h filters take nothing)`);
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
