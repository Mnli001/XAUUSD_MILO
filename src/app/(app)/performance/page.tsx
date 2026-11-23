import { requireUser } from "@/lib/auth";
import { listTrades } from "@/lib/trades";
import { performance } from "@/lib/analysis/journal";
import { EquityCurve } from "@/components/EquityCurve";
import { sessionColor } from "@/components/SessionLine";
import { Figures, Pnl, signedUsd, Dir } from "@/components/Timetable";
import { getT, getViewer } from "@/lib/prefs.server";
import { sessionLabel, sessionOfUbHour, weekdayName } from "@/lib/time";
import type { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Гүйцэтгэл — XAU Analytics", "Performance — XAU Analytics") };
}

type Row = { key: string; label: string; count: number; pnl: number; color?: string };

/** One breakdown as a timetable: a label, the count, the signed result and a bar that leans to its side. */
function Breakdown({ id, title, rows, t }: { id: string; title: string; rows: Row[]; t: T }) {
  const top = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  return (
    <section className="table-card" aria-labelledby={id}>
      <h2 id={id} className="px-4 pt-4 pb-2 text-[15px] font-semibold text-zinc-100 sm:px-5 sm:pt-5">{title}</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="th"><span className="sr-only">{title}</span></th>
            <th className="th text-right">{t("Тоо", "Count")}</th>
            <th className="th text-right">P&L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-zinc-800/70 first:border-t-0">
              <td className="td">
                <span className="flex items-center gap-2.5">
                  {r.color && <span aria-hidden className="h-5 w-[5px] shrink-0 rounded-full" style={{ background: r.color }} />}
                  <span className="font-medium text-zinc-100 tabular-nums">{r.label}</span>
                </span>
              </td>
              <td className="td text-right text-zinc-400 tabular-nums">{r.count}</td>
              <td className="td text-right">
                <Pnl value={r.pnl} />
                <span aria-hidden className="mt-1 ml-auto flex h-[5px] w-24 overflow-hidden rounded-full bg-zinc-800">
                  <span className="flex flex-1 justify-end">{r.pnl < 0 && <span className="h-full rounded-full bg-red-500" style={{ width: `${(Math.abs(r.pnl) / top) * 100}%` }} />}</span>
                  <span className="w-px bg-zinc-600" />
                  <span className="flex flex-1">{r.pnl > 0 && <span className="h-full rounded-full bg-emerald-500" style={{ width: `${(r.pnl / top) * 100}%` }} />}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function PerformancePage() {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const p = performance(await listTrades(user.id));
  const head = (
    <div>
      <h1 className="page-title">{t("Гүйцэтгэл", "Performance")}</h1>
      <p className="page-lede">{t("Таны журналын хаагдсан арилжаанаас тооцсон статистик. Ирээдүйн ашгийг батлахгүй.", "Statistics from the closed trades in your journal. They do not promise future profit.")}</p>
    </div>
  );
  if (p.count === 0) {
    return <div className="space-y-4 sm:space-y-5">{head}<div className="card text-sm leading-relaxed text-zinc-400">{t("Хаагдсан арилжаа алга. Журналдаа гарсан үнэтэй арилжаа оруулсны дараа статистик энд гарна.", "No closed trades yet. Statistics appear here once your journal has trades with an exit price.")}</div></div>;
  }
  const tone = (n: number) => (n > 0 ? "text-emerald-400" : n < 0 ? "text-red-400" : "text-zinc-50");
  const arrow = (n: number) => (n === 0 ? null : <><Dir d={n} />{" "}</>);
  const rows = <K extends string | number>(m: Record<K, { count: number; pnl: number }>, label: (k: string) => string, color?: (k: string) => string): Row[] =>
    Object.entries<{ count: number; pnl: number }>(m).sort(([a], [b]) => Number(a) - Number(b)).map(([k, b]) => ({ key: k, label: label(k), color: color?.(k), ...b }));
  return (
    <div className="space-y-4 sm:space-y-5">
      {head}
      <Figures label={t("Гол үзүүлэлт", "Key figures")} items={[
        { label: t("Нийт P&L", "Total P&L"), value: <>{arrow(p.totalPnl)}{signedUsd(p.totalPnl)}</>, tone: tone(p.totalPnl) },
        { label: "Win rate", value: `${p.winRate!.toFixed(1)}%` },
        { label: "Profit factor", value: p.profitFactor === null ? "—" : p.profitFactor.toFixed(2) },
        { label: t("Дундаж R", "Average R"), value: p.avgR === null ? "—" : `${p.avgR > 0 ? "+" : p.avgR < 0 ? "−" : ""}${Math.abs(p.avgR).toFixed(2)}R`, tone: p.avgR === null ? undefined : tone(p.avgR) },
        { label: t("Хамгийн их drawdown", "Max drawdown"), value: p.maxDrawdown > 0 ? <><Dir d={-1} /> {signedUsd(-p.maxDrawdown)}</> : signedUsd(0), tone: p.maxDrawdown > 0 ? "text-red-400" : undefined },
        { label: t("Арилжааны тоо", "Trades"), value: String(p.count) },
      ]} />
      <section className="card" aria-labelledby="curve-h">
        <h2 id="curve-h" className="mb-3 text-[15px] font-semibold text-zinc-100">{t("Нийт P&L-ийн муруй", "Cumulative P&L curve")}</h2>
        <EquityCurve points={p.equity} v={v} />
      </section>
      <div className="grid items-start gap-4 sm:gap-5 md:grid-cols-3">
        <Breakdown id="by-session" t={t} title={t("Сессээр", "By session")} rows={Object.entries(p.bySession).map(([k, b]) => ({ key: k, label: sessionLabel(k, t), color: sessionColor(k), ...b }))} />
        <Breakdown id="by-weekday" t={t} title={t("Гарагаар", "By weekday")} rows={rows(p.byWeekday, (k) => weekdayName(Number(k), t))} />
        <Breakdown id="by-hour" t={t} title={`${t("Нээсэн цагаар", "By opening hour")} · ${v.zone}`} rows={rows(p.byHour, (k) => v.ub(`${k.padStart(2, "0")}:00`), (k) => sessionColor(sessionOfUbHour(Number(k))))} />
      </div>
      <p className="max-w-prose text-xs leading-relaxed text-zinc-500">{t("Зөвхөн хаагдсан арилжаа тооцогдоно. 1 лот = 100 унц. R нь stop loss оруулсан арилжаанд л гарна. Profit factor нь алдагдалтай арилжаа байхгүй үед гарахгүй.", "Only closed trades are counted. 1 lot = 100 oz. R is shown only for trades with a stop loss. Profit factor is not shown when there are no losing trades.")}</p>
    </div>
  );
}
