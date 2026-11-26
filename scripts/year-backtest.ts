/**
 * One year of the session rules on a small account, the way the robot trades them: one position at a time,
 * entry at the next candle's open plus the spread, stop first inside a candle, each rule's own time exit.
 * Prints JSON (monthly results and every trade) for the report.
 *   npx tsx --env-file=.env scripts/year-backtest.ts 50 1000 > year.json
 */
import { closeDb } from "../src/lib/db";
import { SESSION_IDEAS, RECORD_BALANCE, ideaContext, ideaTrades } from "../src/lib/bot/ideas";
import { loadBacktestData } from "../src/lib/bot/run";

const START = Number(process.argv[2] ?? 50), LEVERAGE = Number(process.argv[3] ?? 1000);
// "standard": 0.01 lot = 1 oz, the smallest size. "cent": a cent account, where lots are 100 times smaller,
// so each trade can risk RISK of the balance (lot step 0.0001 of a standard lot).
const MODE = (process.argv[4] ?? "standard") as "standard" | "cent", RISK = Number(process.argv[5] ?? 0.02);
const OZ_PER_LOT = 100, MIN_LOT = MODE === "cent" ? 0.0001 : 0.01;

async function main() {
  const data = await loadBacktestData();
  const p = ideaContext(data);
  const end = data.m15.at(-1)!.time.getTime(), from = end - 365 * 864e5;
  type T = { setup: string; side: string; openedAt: Date; closedAt: Date; entry: number; stop: number; exit: number; r: number; reason: string };
  const all: T[] = [];
  SESSION_IDEAS.forEach((idea) => {
    for (const t of ideaTrades(p, idea, RECORD_BALANCE)) if (t.openedAt.getTime() >= from) all.push({ setup: idea.name, side: t.direction, openedAt: t.openedAt, closedAt: t.closedAt, entry: t.entryPrice, stop: t.stopLoss, exit: t.exitPrice, r: t.r, reason: t.reason });
  });
  all.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  // PARALLEL: each session may hold its own trade (up to three at once, as robot v3.60 does); otherwise one at a time.
  // Lots are sized from the balance when a trade opens; its result lands when it closes.
  const PARALLEL = (process.argv[6] ?? "parallel") === "parallel";
  const taken: (T & { lots: number; pnl: number; balance: number; margin: number })[] = [];
  let busy = 0, balance = START, peak = START, maxDd = 0, maxDdPct = 0, low = START;
  const open: (T & { lots: number; margin: number })[] = [];
  const settle = (until: number) => {
    open.sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
    while (open.length && open[0].closedAt.getTime() <= until) {
      const o = open.shift()!;
      const pnl = (o.side === "BUY" ? 1 : -1) * (o.exit - o.entry) * OZ_PER_LOT * o.lots;
      balance += pnl;
      peak = Math.max(peak, balance); low = Math.min(low, balance);
      maxDd = Math.max(maxDd, peak - balance); maxDdPct = Math.max(maxDdPct, (peak - balance) / peak);
      taken.push({ ...o, pnl, balance });
    }
  };
  for (const t of all) {
    settle(t.openedAt.getTime());
    if (PARALLEL ? open.length >= 3 : open.length > 0 || t.openedAt.getTime() < busy) continue;
    const dist = Math.abs(t.entry - t.stop);
    // Risk RISK of the balance, in the broker's lot steps; never under the smallest lot (on a tiny account that risks more).
    const lots = Math.max(MIN_LOT, Math.round(Math.floor((balance * RISK) / (dist * OZ_PER_LOT) / MIN_LOT + 1e-9) * MIN_LOT * 1e4) / 1e4);
    if (balance <= 0) break;
    const margin = (t.entry * OZ_PER_LOT * lots) / LEVERAGE;
    const used = open.reduce((m, o) => m + o.margin, 0);
    if (margin + used > balance) continue;
    open.push({ ...t, lots, margin });
    busy = t.closedAt.getTime();
  }
  settle(Infinity);
  taken.sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
  const months = new Map<string, { n: number; wins: number; pnl: number; r: number; endBalance: number }>();
  for (const t of taken) {
    const k = t.closedAt.toISOString().slice(0, 7);
    const m = months.get(k) ?? { n: 0, wins: 0, pnl: 0, r: 0, endBalance: 0 };
    m.n++; if (t.pnl > 0) m.wins++; m.pnl += t.pnl; m.r += t.r; m.endBalance = t.balance;
    months.set(k, m);
  }
  const wins = taken.filter((t) => t.pnl > 0), losses = taken.filter((t) => t.pnl <= 0);
  const gross = wins.reduce((s, t) => s + t.pnl, 0), lost = -losses.reduce((s, t) => s + t.pnl, 0);
  console.log(JSON.stringify({
    start: START, leverage: LEVERAGE, mode: MODE, risk: RISK, parallel: PARALLEL, from: new Date(from).toISOString(), to: new Date(end).toISOString(),
    trades: taken.length, skippedOverlap: all.length - taken.length, wins: wins.length, losses: losses.length,
    endBalance: balance, profit: balance - START, returnPct: ((balance - START) / START) * 100,
    profitFactor: lost > 0 ? gross / lost : null, avgWin: wins.length ? gross / wins.length : 0, avgLoss: losses.length ? lost / losses.length : 0,
    maxDrawdown: maxDd, maxDrawdownPct: maxDdPct * 100, lowestBalance: low, biggestLoss: Math.min(...taken.map((t) => t.pnl)), maxMargin: Math.max(...taken.map((t) => t.margin)),
    bySetup: Object.fromEntries(SESSION_IDEAS.map((i) => { const ts = taken.filter((t) => t.setup === i.name); return [i.name, { n: ts.length, pnl: ts.reduce((s, t) => s + t.pnl, 0), wins: ts.filter((t) => t.pnl > 0).length }]; })),
    months: [...months].map(([month, m]) => ({ month, ...m })),
    list: taken.map((t) => ({ setup: t.setup, side: t.side, at: t.openedAt.toISOString(), closed: t.closedAt.toISOString(), entry: t.entry, stop: t.stop, exit: t.exit, r: Math.round(t.r * 100) / 100, pnl: Math.round(t.pnl * 100) / 100, balance: Math.round(t.balance * 100) / 100, reason: t.reason })),
  }));
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
