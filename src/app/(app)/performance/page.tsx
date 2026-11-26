import { TermHint } from "@/components/TermHint";
import { profitFactorNote } from "@/lib/glossary";
import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { performanceOf } from "@/lib/analysis/journal";
import { botTrades, pickAccount } from "@/lib/botPerformance";
import { listAccounts } from "@/lib/bot/liveDb";
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

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const { account: asked } = await searchParams;
  const accounts = await listAccounts(user.id, new Date());
  const login = pickAccount(accounts, typeof asked === "string" ? asked : undefined);
  const p = performanceOf(login ? await botTrades(user.id, login) : []);
  const current = accounts.find((a) => a.login === login);
  const head = (
    <div>
      <h1 className="page-title">{t("Гүйцэтгэл", "Performance")}</h1>
      <p className="page-lede">{t("Таны MT5 робот дээр хаагдсан арилжаанаас автоматаар тооцсон статистик. Гараар юу ч бичих шаардлагагүй. Ирээдүйн ашгийг батлахгүй.", "Statistics worked out automatically from the trades your MT5 robot closed. Nothing to type in. They do not promise future profit.")}</p>
    </div>
  );
  // One account at a time: a demo and a real account added together would say nothing true about either.
  const picker = accounts.length > 1 && (
    <nav aria-label={t("MT5 данс", "MT5 account")} className="flex flex-wrap gap-2">
      {accounts.map((a) => (
        <Link key={a.login} href={`/performance?account=${encodeURIComponent(a.login)}`} aria-current={a.login === login ? "page" : undefined}
          className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm ${a.login === login ? "border-amber-400 bg-zinc-800 font-semibold text-zinc-50" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>
          <span className="tabular-nums">{a.label}</span>
          {a.mode === "REAL" && <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-xs font-semibold text-red-400">{t("Жинхэнэ", "Real")}</span>}
          {a.mode === "DEMO" && <span className="rounded-md bg-zinc-700/60 px-1.5 py-0.5 text-xs font-semibold text-zinc-300">{t("Демо", "Demo")}</span>}
        </Link>
      ))}
    </nav>
  );
  if (p.count === 0) {
    return (
      <div className="space-y-4 sm:space-y-5">{head}{picker}
        <div className="card text-sm leading-relaxed text-zinc-400">
          {login
            ? t("Энэ дансанд робот хаасан арилжаа алга. Робот арилжаа хаах бүрд статистик энд автоматаар нэмэгдэнэ.", "The robot has not closed a trade on this account yet. Each trade it closes is added here by itself.")
            : t("MT5 робот холбогдоогүй байна. Бот хуудаснаас роботоо холбовол хаагдсан арилжаа бүрийн статистик энд автоматаар гарна.", "No MT5 robot is connected. Connect it on the Bot page and every trade it closes shows up here by itself.")}
          <div className="mt-3"><Link href="/bot" className="font-semibold text-amber-300 hover:text-amber-200">{t("Бот руу", "Open the bot")}</Link></div>
        </div>
      </div>
    );
  }
  const tone = (n: number) => (n > 0 ? "text-emerald-400" : n < 0 ? "text-red-400" : "text-zinc-50");
  const arrow = (n: number) => (n === 0 ? null : <><Dir d={n} />{" "}</>);
  const rows = <K extends string | number>(m: Record<K, { count: number; pnl: number }>, label: (k: string) => string, color?: (k: string) => string): Row[] =>
    Object.entries<{ count: number; pnl: number }>(m).sort(([a], [b]) => Number(a) - Number(b)).map(([k, b]) => ({ key: k, label: label(k), color: color?.(k), ...b }));
  return (
    <div className="space-y-4 sm:space-y-5">
      {head}
      {picker}
      {current?.mode === "DEMO" && <p className="text-sm text-zinc-400">{t("Демо данс: бодит мөнгө биш. Жинхэнэ дансны үр дүн өөр байж болно.", "Demo account: not real money. A real account can do differently.")}</p>}
      <Figures label={t("Гол үзүүлэлт", "Key figures")} items={[
        { label: t("Нийт P&L", "Total P&L"), value: <>{arrow(p.totalPnl)}{signedUsd(p.totalPnl)}</>, tone: tone(p.totalPnl), hint: <TermHint id="pnl" />,
          note: t("Роботын хаасан бүх арилжааны нийт ашиг, алдагдал", "Every trade the robot closed, profit and loss added up") },
        { label: "Win rate", value: `${p.winRate!.toFixed(1)}%`, hint: <TermHint id="win-rate" />,
          note: t("Ашигтай хаагдсан арилжааны хувь", "Share of trades closed in profit") },
        { label: "Profit factor", value: p.profitFactor === null ? "—" : p.profitFactor.toFixed(2), hint: <TermHint id="profit-factor" />,
          note: profitFactorNote(p.profitFactor, t) },
        { label: t("Арилжаа тутмын дундаж", "Average per trade"), value: <>{arrow(p.totalPnl)}{signedUsd(p.totalPnl / p.count)}</>, tone: tone(p.totalPnl),
          note: t("Нийт P&L-ийг арилжааны тоонд хуваасан", "Total P&L divided by the number of trades") },
        { label: t("Хамгийн их drawdown", "Max drawdown"), value: p.maxDrawdown > 0 ? <><Dir d={-1} /> {signedUsd(-p.maxDrawdown)}</> : signedUsd(0), tone: p.maxDrawdown > 0 ? "text-red-400" : undefined, hint: <TermHint id="drawdown" />,
          note: t("Өмнөх оргилоосоо хамгийн их унасан дүн", "Largest drop from a previous peak") },
        { label: t("Арилжааны тоо", "Trades"), value: String(p.count),
          note: t("Тооцоонд орсон хаагдсан арилжаа", "Closed trades counted") },
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
      <p className="max-w-prose text-xs leading-relaxed text-zinc-500">{t("Зөвхөн хаагдсан арилжаа тооцогдоно; ашиг, алдагдлыг робот MT5-аас тайлагнасан дүнгээр нь авна. Нээсэн цагийг робот бүртгэсэн бол түүгээр, үгүй бол хаагдсан цагаар нь тооцно. Profit factor нь алдагдалтай арилжаа байхгүй үед гарахгүй.", "Only closed trades are counted, at the profit or loss the robot reported from MT5. The opening hour is the one the robot recorded, else the closing hour. Profit factor is not shown when there are no losing trades.")}</p>
    </div>
  );
}
