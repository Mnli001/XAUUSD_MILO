import type { RevenueReport } from "@/lib/revenue";
import type { Viewer } from "@/lib/viewer";
import { PLANS, isPlanId, tugrik } from "@/lib/plans";

const tile = "rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5";

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={tile}>
      <p className="text-xs font-semibold text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-50 tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-zinc-500 tabular-nums">{note}</p>}
    </div>
  );
}

/** Revenue by month as gold columns from a common baseline; each column names its month and amount on hover. */
function MonthChart({ r, v }: { r: RevenueReport; v: Viewer }) {
  const { t } = v;
  const max = Math.max(1, ...r.months.map((m) => m.revenue));
  return (
    <section className={tile} aria-labelledby="rev-chart-h">
      <h2 id="rev-chart-h" className="text-sm font-semibold text-zinc-200">{t("Сар бүрийн орлого", "Revenue by month")}</h2>
      <div role="img" aria-label={t(`Сүүлийн 6 сарын орлого: ${r.months.map((m) => `${m.key} ${tugrik(m.revenue)}`).join(", ")}`, `Revenue over the last 6 months: ${r.months.map((m) => `${m.key} ${tugrik(m.revenue)}`).join(", ")}`)}
        className="mt-4 flex h-40 items-end gap-0.5 border-b border-zinc-700">
        {r.months.map((m, i) => {
          const last = i === r.months.length - 1;
          return (
            <div key={m.key} className="group relative flex h-full flex-1 items-end justify-center px-[3px]" title={t(`${m.key}: ${tugrik(m.revenue)}, ${m.payments} төлбөр`, `${m.key}: ${tugrik(m.revenue)}, ${m.payments} payments`)}>
              <div data-bar className={`w-full max-w-14 rounded-t-[4px] transition-opacity group-hover:opacity-80 ${last ? "bg-amber-400" : "bg-amber-400/55"}`} style={{ height: `${m.revenue > 0 ? Math.max(2, (m.revenue / max) * 100) : 0}%` }} />
              {last && m.revenue > 0 && <span className="absolute -top-0.5 text-xs font-semibold text-zinc-200 tabular-nums" style={{ bottom: `calc(${(m.revenue / max) * 100}% + 4px)`, top: "auto" }}>{tugrik(m.revenue)}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-0.5" aria-hidden>
        {r.months.map((m) => <span key={m.key} className="flex-1 text-center text-[11px] text-zinc-500 tabular-nums">{m.key.slice(2).replace("-", "/")}</span>)}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-zinc-400 hover:text-zinc-200">{t("Тоогоор харах", "Show as a table")}</summary>
        <table aria-label={t("Сар бүрийн орлого", "Revenue by month")} className="mt-2 w-full text-sm tabular-nums">
          <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1 font-medium">{t("Сар", "Month")}</th><th className="py-1 text-right font-medium">{t("Орлого", "Revenue")}</th><th className="py-1 text-right font-medium">{t("Шинэ", "New")}</th><th className="py-1 text-right font-medium">{t("Сунгалт", "Renewals")}</th></tr></thead>
          <tbody>{r.months.map((m) => <tr key={m.key} className="border-t border-zinc-800"><td className="py-1 text-zinc-300">{m.key}</td><td className="py-1 text-right text-zinc-100">{tugrik(m.revenue)}</td><td className="py-1 text-right text-zinc-300">{m.newPayers}</td><td className="py-1 text-right text-zinc-300">{m.renewals}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}

function People({ id, title, empty, rows, v, note }: { id: string; title: string; empty: string; rows: { email: string; until: Date }[]; v: Viewer; note: string }) {
  return (
    <section className={tile} aria-labelledby={id}>
      <h2 id={id} className="text-sm font-semibold text-zinc-200">{title}</h2>
      {rows.length === 0 ? <p className="mt-2 text-sm text-zinc-500">{empty}</p> : (
        <ul className="mt-2 divide-y divide-zinc-800 text-sm">
          {rows.map((u) => (
            <li key={u.email} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-zinc-200">{u.email}</span>
              <span className="shrink-0 text-xs text-zinc-500 tabular-nums">{note} {v.date(u.until)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RevenueView({ r, v }: { r: RevenueReport; v: Viewer }) {
  const { t } = v;
  const change = r.lastMonth.revenue > 0 ? Math.round(((r.thisMonth.revenue - r.lastMonth.revenue) / r.lastMonth.revenue) * 100) : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("Энэ сарын орлого", "This month")} value={tugrik(r.thisMonth.revenue)}
          note={t(`Өмнөх сар ${tugrik(r.lastMonth.revenue)}${change === null ? "" : ` (${change > 0 ? "+" : ""}${change}%)`}`, `Last month ${tugrik(r.lastMonth.revenue)}${change === null ? "" : ` (${change > 0 ? "+" : ""}${change}%)`}`)} />
        <Kpi label={t("Идэвхтэй захиалагч", "Active subscribers")} value={String(r.active)}
          note={t(`Бүртгэлтэй ${r.allTime.registered}-ийн ${r.allTime.payingPct}% нь төлж байсан`, `${r.allTime.payingPct}% of ${r.allTime.registered} registered have paid`)} />
        <Kpi label={t("Сунгасан хувь", "Renewal rate")} value={r.renewalPct === null ? "—" : `${r.renewalPct}%`}
          note={r.cameDue === 0 ? t("Сүүлийн 30 хоногт дуусах багц байгаагүй", "No plans came due in the last 30 days") : t(`30 хоногт дууссан ${r.cameDue}-оос ${r.renewed} нь сунгасан`, `${r.renewed} of ${r.cameDue} that came due in 30 days renewed`)} />
        <Kpi label={t("Нийт орлого", "All time")} value={tugrik(r.allTime.revenue)} note={t(`${r.allTime.payments} төлбөр, ${r.allTime.payers} хүн`, `${r.allTime.payments} payments from ${r.allTime.payers} people`)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <MonthChart r={r} v={v} />
        <section className={tile} aria-labelledby="rev-plans-h">
          <h2 id="rev-plans-h" className="text-sm font-semibold text-zinc-200">{t("Багцаар", "By plan")}</h2>
          <table className="mt-2 w-full text-sm tabular-nums">
            <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1 font-medium">{t("Багц", "Plan")}</th><th className="py-1 text-right font-medium">{t("Төлбөр", "Payments")}</th><th className="py-1 text-right font-medium">{t("Орлого", "Revenue")}</th></tr></thead>
            <tbody>{r.plans.map((p) => <tr key={p.plan} className="border-t border-zinc-800"><td className="py-2 text-zinc-200">{isPlanId(p.plan) ? PLANS[p.plan].name : p.plan}</td><td className="py-2 text-right text-zinc-300">{p.payments}</td><td className="py-2 text-right text-zinc-100">{tugrik(p.revenue)}</td></tr>)}</tbody>
          </table>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <People id="rev-soon-h" title={t("7 хоногт дуусах", "Ending within 7 days")} empty={t("Энэ долоо хоногт дуусах багц алга.", "No plans end this week.")} rows={r.endingSoon} v={v} note={t("дуусна", "ends")} />
        <People id="rev-left-h" title={t("Сунгаагүй (30 хоног)", "Did not renew (30 days)")} empty={t("Сүүлийн 30 хоногт гарсан хүн алга.", "Nobody left in the last 30 days.")} rows={r.left} v={v} note={t("дууссан", "ended")} />
      </div>
    </div>
  );
}
