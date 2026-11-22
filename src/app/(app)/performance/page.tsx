import { requireUser } from "@/lib/auth";
import { listTrades } from "@/lib/trades";
import { performance } from "@/lib/analysis/journal";
import { EquityCurve } from "@/components/EquityCurve";
import { usd, pnlClass } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Гүйцэтгэл — XAU Analytics" };

const WEEKDAYS = ["", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба", "Ням"];

function Breakdown({ title, rows }: { title: string; rows: [string, { count: number; pnl: number }][] }) {
  return (
    <div className="table-card">
      <h2 className="px-4 pt-4 text-sm font-medium text-zinc-400 sm:px-5 sm:pt-5">{title}</h2>
      <table className="w-full">
        <thead><tr><th className="th"></th><th className="th text-right">Тоо</th><th className="th text-right">P&L</th></tr></thead>
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
  const user = await requireUser();
  const p = performance(await listTrades(user.id));
  if (p.count === 0) {
    return <div className="space-y-4"><h1 className="page-title">Гүйцэтгэл</h1><div className="card text-zinc-400">Хаагдсан арилжаа алга. Журналдаа гарсан үнэтэй арилжаа оруулсны дараа статистик энд гарна.</div></div>;
  }
  const cards: [string, string, string?][] = [
    ["Win rate", `${p.winRate!.toFixed(1)}%`],
    ["Нийт P&L", usd(p.totalPnl), pnlClass(p.totalPnl)],
    ["Profit factor", p.profitFactor === null ? "—" : p.profitFactor.toFixed(2)],
    ["Дундаж R", p.avgR === null ? "—" : `${p.avgR.toFixed(2)}R`],
    ["Хамгийн их drawdown", usd(-p.maxDrawdown), p.maxDrawdown > 0 ? "text-red-400" : undefined],
    ["Арилжааны тоо", String(p.count)],
  ];
  const sorted = <K extends string | number>(m: Record<K, { count: number; pnl: number }>, label: (k: string) => string) =>
    Object.entries(m).sort(([a], [b]) => Number(a) - Number(b)).map(([k, b]) => [label(k), b] as [string, { count: number; pnl: number }]);
  return (
    <div className="space-y-4">
      <h1 className="page-title">Гүйцэтгэл</h1>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
        {cards.map(([k, v, c]) => <div key={k} className="card"><div className="text-xs text-zinc-400">{k}</div><div className={`mt-1 font-mono text-xl font-semibold tracking-tight ${c ?? ""}`}>{v}</div></div>)}
      </div>
      <div className="card"><h2 className="card-title">Нийт P&L-ийн муруй</h2><EquityCurve points={p.equity} /></div>
      <div className="grid items-start gap-4 md:grid-cols-3">
        <Breakdown title="Сессээр" rows={Object.entries(p.bySession)} />
        <Breakdown title="Гарагаар" rows={sorted(p.byWeekday, (k) => WEEKDAYS[Number(k)])} />
        <Breakdown title="Нээсэн цагаар (УБ)" rows={sorted(p.byHour, (k) => `${k.padStart(2, "0")}:00`)} />
      </div>
      <p className="max-w-prose text-xs leading-relaxed text-zinc-500">Зөвхөн хаагдсан арилжаа тооцогдоно. 1 лот = 100 унц. R нь stop loss оруулсан арилжаанд л гарна. Profit factor нь алдагдалтай арилжаа байхгүй үед гарахгүй.</p>
    </div>
  );
}
