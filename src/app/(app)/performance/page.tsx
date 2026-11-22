import { requireUser } from "@/lib/auth";
import { listTrades } from "@/lib/trades";
import { performance } from "@/lib/analysis/journal";
import { EquityCurve } from "@/components/EquityCurve";
import { usd, pnlClass } from "@/lib/format";
import { getT, getViewer } from "@/lib/prefs.server";
import { sessionLabel, weekdayName } from "@/lib/time";
import type { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Гүйцэтгэл — XAU Analytics", "Performance — XAU Analytics") };
}


function Breakdown({ title, rows, t }: { title: string; rows: [string, { count: number; pnl: number }][]; t: T }) {
  return (
    <div className="table-card">
      <h2 className="px-4 pt-4 text-sm font-medium text-zinc-400 sm:px-5 sm:pt-5">{title}</h2>
      <table className="w-full">
        <thead><tr><th className="th"></th><th className="th text-right">{t("Тоо", "Count")}</th><th className="th text-right">P&L</th></tr></thead>
        <tbody>
          {rows.map(([k, b]) => (
            <tr key={k} className="border-t border-zinc-800"><td className="td">{k}</td><td className="td text-right font-mono">{b.count}</td><td className={`td text-right font-mono ${pnlClass(b.pnl)}`}>{usd(b.pnl)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function PerformancePage() {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const p = performance(await listTrades(user.id));
  if (p.count === 0) {
    return <div className="space-y-4"><h1 className="page-title">{t("Гүйцэтгэл", "Performance")}</h1><div className="card text-zinc-400">{t("Хаагдсан арилжаа алга. Журналдаа гарсан үнэтэй арилжаа оруулсны дараа статистик энд гарна.", "No closed trades yet. Statistics appear here once your journal has trades with an exit price.")}</div></div>;
  }
  const cards: [string, string, string?][] = [
    ["Win rate", `${p.winRate!.toFixed(1)}%`],
    [t("Нийт P&L", "Total P&L"), usd(p.totalPnl), pnlClass(p.totalPnl)],
    ["Profit factor", p.profitFactor === null ? "—" : p.profitFactor.toFixed(2)],
    [t("Дундаж R", "Average R"), p.avgR === null ? "—" : `${p.avgR.toFixed(2)}R`],
    [t("Хамгийн их drawdown", "Max drawdown"), usd(-p.maxDrawdown), p.maxDrawdown > 0 ? "text-red-400" : undefined],
    [t("Арилжааны тоо", "Trades"), String(p.count)],
  ];
  const sorted = <K extends string | number>(m: Record<K, { count: number; pnl: number }>, label: (k: string) => string) =>
    Object.entries(m).sort(([a], [b]) => Number(a) - Number(b)).map(([k, b]) => [label(k), b] as [string, { count: number; pnl: number }]);
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("Гүйцэтгэл", "Performance")}</h1>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
        {cards.map(([k, val, c]) => <div key={k} className="card"><div className="text-xs text-zinc-400">{k}</div><div className={`mt-1 font-mono text-xl font-semibold tracking-tight ${c ?? ""}`}>{val}</div></div>)}
      </div>
      <div className="card"><h2 className="card-title">{t("Нийт P&L-ийн муруй", "Cumulative P&L curve")}</h2><EquityCurve points={p.equity} v={v} /></div>
      <div className="grid items-start gap-4 md:grid-cols-3">
        <Breakdown t={t} title={t("Сессээр", "By session")} rows={Object.entries(p.bySession).map(([k, b]) => [sessionLabel(k, t), b] as [string, { count: number; pnl: number }])} />
        <Breakdown t={t} title={t("Гарагаар", "By weekday")} rows={sorted(p.byWeekday, (k) => weekdayName(Number(k), t))} />
        <Breakdown t={t} title={`${t("Нээсэн цагаар", "By opening hour")} (${v.zone})`} rows={sorted(p.byHour, (k) => v.ub(`${k.padStart(2, "0")}:00`))} />
      </div>
      <p className="max-w-prose text-xs leading-relaxed text-zinc-500">{t("Зөвхөн хаагдсан арилжаа тооцогдоно. 1 лот = 100 унц. R нь stop loss оруулсан арилжаанд л гарна. Profit factor нь алдагдалтай арилжаа байхгүй үед гарахгүй.", "Only closed trades are counted. 1 lot = 100 oz. R is shown only for trades with a stop loss. Profit factor is not shown when there are no losing trades.")}</p>
    </div>
  );
}
