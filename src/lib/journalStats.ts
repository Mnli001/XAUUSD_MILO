import type { Viewer } from "./viewer";
import { sessionOfUbHour, ubHour, zoneWeekday, formatTime } from "./time";

/** One closed trade as the analysis needs it. */
export type JRow = { symbol: string; side: string; lots: number; openPrice: number; closePrice: number; openTime: Date; closeTime: Date; profit: number; magic: string };

export type Bucket = { key: string; trades: number; wins: number; winPct: number; net: number; avg: number };
export type Totals = Bucket & { avgWin: number | null; avgLoss: number | null; profitFactor: number | null; expectancy: number; maxLossStreak: number; best: number | null; worst: number | null };
export type Insight = { kind: "revenge" | "hold" | "bigLots" | "bestSession" | "worstSession" | "worstHour" | "worstDay" | "sideBias"; tone: "good" | "bad"; text: string };

/** A new trade opened this soon after a losing one closed counts as taken "right after a loss". */
export const REVENGE_MIN = 30;
/** A trade this many times the median size counts as oversized. */
export const BIG_LOT_X = 1.5;
/** A group needs this many trades before an insight is drawn from it. */
export const INSIGHT_MIN = 5;

const SESSION_KEY: Record<string, string> = { "Ази": "ASIA", "Лондон": "LONDON", "Нью-Йорк": "NY", "Завсар": "OFF" }; // i18n-ok: the stored keys on the left
const round = (n: number) => Math.round(n * 100) / 100;

function bucket(key: string, rows: JRow[]): Bucket {
  const wins = rows.filter((r) => r.profit > 0).length;
  const net = rows.reduce((s, r) => s + r.profit, 0);
  return { key, trades: rows.length, wins, winPct: rows.length ? Math.round((wins / rows.length) * 100) : 0, net: round(net), avg: rows.length ? round(net / rows.length) : 0 };
}

function groupBy(rows: JRow[], keyOf: (r: JRow) => string, order?: string[]): Bucket[] {
  const m = new Map<string, JRow[]>();
  for (const k of order ?? []) m.set(k, []);
  for (const r of rows) { const k = keyOf(r); m.set(k, [...(m.get(k) ?? []), r]); }
  return [...m].filter(([, v]) => v.length || !order).map(([k, v]) => bucket(k, v));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const minutes = (r: JRow) => (r.closeTime.getTime() - r.openTime.getTime()) / 6e4;
const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function journalStats(input: JRow[], v: Viewer) {
  const rows = [...input].sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
  const byClose = [...input].sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime());
  const t = v.t;
  const base = bucket("all", rows);
  const winsP = rows.filter((r) => r.profit > 0).map((r) => r.profit);
  const lossP = rows.filter((r) => r.profit < 0).map((r) => r.profit);
  const gross = winsP.reduce((a, b) => a + b, 0), grossLoss = -lossP.reduce((a, b) => a + b, 0);
  let streak = 0, maxLossStreak = 0;
  for (const r of byClose) { streak = r.profit < 0 ? streak + 1 : 0; maxLossStreak = Math.max(maxLossStreak, streak); }
  const totals: Totals = {
    ...base,
    avgWin: winsP.length ? round(gross / winsP.length) : null,
    avgLoss: lossP.length ? round(-grossLoss / lossP.length) : null,
    profitFactor: grossLoss > 0 ? round(gross / grossLoss) : null,
    expectancy: base.avg,
    maxLossStreak,
    best: rows.length ? round(Math.max(...rows.map((r) => r.profit))) : null,
    worst: rows.length ? round(Math.min(...rows.map((r) => r.profit))) : null,
  };

  const bySession = groupBy(rows, (r) => SESSION_KEY[sessionOfUbHour(ubHour(r.openTime))], ["ASIA", "LONDON", "NY", "OFF"]);
  const byWeekday = groupBy(rows, (r) => String(zoneWeekday(r.openTime, v.timeZone)), ["1", "2", "3", "4", "5", "6", "7"]);
  const byHour = groupBy(rows, (r) => formatTime(r.openTime, v.timeZone).slice(0, 2)).sort((a, b) => a.key.localeCompare(b.key));
  const bySide = groupBy(rows, (r) => r.side, ["BUY", "SELL"]);
  const bySymbol = groupBy(rows, (r) => r.symbol).sort((a, b) => b.trades - a.trades);

  // Behaviour: trades taken soon after a loss closed, oversized trades, and how long losers are held next to winners.
  const afterLossRows = rows.filter((r) => byClose.some((p) => p !== r && p.profit < 0 && p.closeTime <= r.openTime && r.openTime.getTime() - p.closeTime.getTime() <= REVENGE_MIN * 6e4));
  const med = median(rows.map((r) => r.lots));
  const bigRows = rows.filter((r) => med > 0 && r.lots > med * BIG_LOT_X);
  const holdWin = avgOf(rows.filter((r) => r.profit > 0).map(minutes));
  const holdLoss = avgOf(rows.filter((r) => r.profit < 0).map(minutes));
  const behaviour = { afterLoss: bucket("afterLoss", afterLossRows), bigLots: bucket("bigLots", bigRows), holdWin: holdWin === null ? null : Math.round(holdWin), holdLoss: holdLoss === null ? null : Math.round(holdLoss) };

  const insights: Insight[] = [];
  const money = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toFixed(2)}`;
  if (afterLossRows.length && behaviour.afterLoss.net < 0 && behaviour.afterLoss.winPct <= base.winPct)
    insights.push({ kind: "revenge", tone: "bad", text: t(`Loss-ын дараа ${REVENGE_MIN} минутын дотор нээсэн ${afterLossRows.length} trade: win ${behaviour.afterLoss.winPct}%, нийт ${money(behaviour.afterLoss.net)}. Loss-ын дараа завсарлага аваарай.`, `${afterLossRows.length} trades opened within ${REVENGE_MIN} minutes of a loss: ${behaviour.afterLoss.winPct}% won, ${money(behaviour.afterLoss.net)} in total. Take a break after a loss.`) });
  if (holdWin !== null && holdLoss !== null && holdLoss > holdWin * 1.5 && lossP.length >= 2)
    insights.push({ kind: "hold", tone: "bad", text: t(`Алдагдалтай trade-ээ дунджаар ${Math.round(holdLoss)} минут, ашигтайгаа ${Math.round(holdWin)} минут барьдаг. Loss-оо удаан барьж, ашгаа эрт хааж байна.`, `You hold losing trades ${Math.round(holdLoss)} minutes on average and winners ${Math.round(holdWin)}. Losses run while profits are cut early.`) });
  if (bigRows.length && behaviour.bigLots.net < 0)
    insights.push({ kind: "bigLots", tone: "bad", text: t(`Ердийнхөөсөө ${BIG_LOT_X}×-ээс том lot-той ${bigRows.length} trade нийт ${money(behaviour.bigLots.net)} авчирсан.`, `${bigRows.length} trades more than ${BIG_LOT_X}× your usual lot size made ${money(behaviour.bigLots.net)} in total.`) });
  const enough = (b: Bucket[]) => b.filter((x) => x.trades >= INSIGHT_MIN);
  const sessName = (k: string) => ({ ASIA: t("Ази", "Asia"), LONDON: t("Лондон", "London"), NY: t("Нью-Йорк", "New York"), OFF: t("Завсар", "Off-hours") })[k] ?? k;
  const ses = enough(bySession).sort((a, b) => b.net - a.net);
  if (ses.length >= 2) {
    const [best, worst] = [ses[0], ses[ses.length - 1]];
    if (best.net > 0) insights.push({ kind: "bestSession", tone: "good", text: t(`Хамгийн сайн session: ${sessName(best.key)} — ${best.trades} trade, win ${best.winPct}%, ${money(best.net)}.`, `Your best session is ${sessName(best.key)}: ${best.trades} trades, ${best.winPct}% won, ${money(best.net)}.`) });
    if (worst.net < 0) insights.push({ kind: "worstSession", tone: "bad", text: t(`${sessName(worst.key)} session-д ${worst.trades} trade нийт ${money(worst.net)} алдсан. Энэ цагт арилжаагаа багасгаж үзээрэй.`, `The ${sessName(worst.key)} session lost ${money(worst.net)} over ${worst.trades} trades. Consider trading less then.`) });
  }
  const hrs = enough(byHour).sort((a, b) => a.net - b.net);
  if (hrs.length >= 2 && hrs[0].net < 0) insights.push({ kind: "worstHour", tone: "bad", text: t(`${hrs[0].key}:00 цагт нээсэн trade хамгийн муу: ${hrs[0].trades} trade, ${money(hrs[0].net)} (${v.zone}).`, `Trades opened at ${hrs[0].key}:00 do worst: ${hrs[0].trades} trades, ${money(hrs[0].net)} (${v.zone}).`) });
  const sides = enough(bySide);
  if (sides.length === 2 && Math.sign(sides[0].net) !== Math.sign(sides[1].net)) {
    const bad = sides[0].net < 0 ? sides[0] : sides[1];
    insights.push({ kind: "sideBias", tone: "bad", text: t(`${bad.key} trade нийт ${money(bad.net)}, нөгөө тал нь ашигтай. ${bad.key} хийхдээ илүү сонголттой бай.`, `Your ${bad.key} trades lost ${money(bad.net)} while the other side made money. Be pickier with ${bad.key}.`) });
  }

  return { totals, bySession, byWeekday, byHour, bySide, bySymbol, behaviour, insights };
}
export type JournalStats = ReturnType<typeof journalStats>;
