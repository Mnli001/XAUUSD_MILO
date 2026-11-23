import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listTrades } from "@/lib/trades";
import { tradePnl, tradeR } from "@/lib/analysis/journal";
import { deleteTradeAction } from "@/lib/actions/trades";
import { getT, getViewer } from "@/lib/prefs.server";
import { weekdayName, zoneWeekday } from "@/lib/time";
import { Pnl, SidePill } from "@/components/Timetable";

const px = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Журнал — XAU Analytics", "Journal — XAU Analytics") };
}

const rText = (r: number | null) => (r === null ? "—" : `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}R`);

export default async function JournalPage() {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const trades = await listTrades(user.id);

  // The journal reads like a timetable: one block per day, the day's closed result beside its date.
  const days: { date: string; first: Date; total: number; closed: number; rows: typeof trades }[] = [];
  for (const tr of trades) {
    const date = v.date(tr.openedAt);
    let day = days.at(-1);
    if (!day || day.date !== date) days.push((day = { date, first: tr.openedAt, total: 0, closed: 0, rows: [] }));
    day.rows.push(tr);
    const pnl = tradePnl(tr);
    if (pnl !== null) { day.total += pnl; day.closed += 1; }
  }
  const dayHead = (d: (typeof days)[number]) => (
    <>
      <span className="font-semibold text-zinc-100 tabular-nums">{d.date}</span>
      <span className="text-zinc-500">{weekdayName(zoneWeekday(d.first, v.timeZone), t)}</span>
      <span className="ml-auto">{d.closed > 0 ? <Pnl value={d.total} /> : <span className="text-zinc-500">—</span>}</span>
    </>
  );
  const imageTag = <span className="ml-2 inline-flex rounded border border-zinc-700 px-1 text-[11px] text-zinc-400">{t("зураг", "image")}</span>;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{t("Арилжааны журнал", "Trade journal")}</h1>
          <p className="page-lede">{t(`Өдрөөр бүлэглэсэн, цаг нь ${v.zone}-аар. Өдрийн дүнд зөвхөн хаагдсан арилжаа орно.`, `Grouped by day, times in ${v.zone}. A day's total counts closed trades only.`)}</p>
        </div>
        <Link href="/journal/new" className="btn">{t("Арилжаа нэмэх", "Add trade")}</Link>
      </div>
      {trades.length === 0 ? (
        <div className="card text-sm leading-relaxed text-zinc-400">{t("Одоогоор арилжаа бүртгээгүй байна. “Арилжаа нэмэх” товчоор эхний арилжаагаа оруулаарай.", "No trades recorded yet. Use “Add trade” to enter your first one.")}</div>
      ) : (
        <>
        {/* Phones: one plate, a day header, then one departure row per trade. */}
        <div className="table-card md:hidden">
          {days.map((d) => (
            <section key={d.date} aria-label={d.date} className="border-t border-zinc-800 first:border-t-0">
              <h2 className="flex items-baseline gap-2 bg-zinc-950/40 px-4 py-2 text-[13px]">{dayHead(d)}</h2>
              <ul>
                {d.rows.map((tr) => {
                  const pnl = tradePnl(tr);
                  const r = tradeR(tr);
                  return (
                    <li key={tr.id} className="border-t border-zinc-800/70 px-4 pt-3 pb-1">
                      <div className="flex items-start gap-3">
                        <span className="w-12 shrink-0 text-[15px] font-bold text-zinc-50 tabular-nums">{v.time(tr.openedAt)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <SidePill side={tr.direction} />
                            <span className="text-sm text-zinc-300 tabular-nums">{tr.lots} {t("лот", "lots")}</span>
                          </div>
                          <div className="mt-1 text-sm text-zinc-400 tabular-nums">{px(tr.entryPrice)} → {tr.exitPrice === null ? "…" : px(tr.exitPrice)}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          {pnl === null ? <span className="text-sm font-semibold text-amber-400">{t("нээлттэй", "open")}</span> : <Pnl value={pnl} className="text-base" />}
                          <div className="text-xs text-zinc-500 tabular-nums">{r === null ? "" : rText(r)}</div>
                        </div>
                      </div>
                      {(tr.note || tr.imageMime) && <p className="mt-2 ml-15 line-clamp-2 text-sm text-zinc-300">{tr.note}{tr.imageMime && imageTag}</p>}
                      <div className="flex items-center justify-end gap-1 text-sm">
                        <Link href={`/journal/${tr.id}`} className="flex min-h-11 items-center px-2 font-medium text-zinc-200 hover:text-zinc-50">{t("Засах", "Edit")}</Link>
                        <form action={deleteTradeAction}><input type="hidden" name="id" value={tr.id} /><button className="min-h-11 px-2 text-red-400 hover:text-red-300">{t("Устгах", "Delete")}</button></form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {/* Wide screens: the full timetable. */}
        <div className="table-card hidden md:block">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="th">{t("Цаг", "Time")}<span className="font-normal"> · {v.zone}</span></th>
                <th className="th">{t("Чиглэл", "Side")}</th>
                <th className="th text-right">{t("Лот", "Lots")}</th>
                <th className="th text-right">{t("Орсон", "Entry")}</th>
                <th className="th text-right">{t("Гарсан", "Exit")}</th>
                <th className="th text-right">P&L</th>
                <th className="th text-right">R</th>
                <th className="th">{t("Тэмдэглэл", "Note")}</th>
                <th className="th"><span className="sr-only">{t("Үйлдэл", "Actions")}</span></th>
              </tr>
            </thead>
            {days.map((d) => (
              <tbody key={d.date}>
                <tr className="border-t border-zinc-800 bg-zinc-950/40">
                  <th scope="rowgroup" colSpan={9} className="td py-2 text-left text-[13px] font-normal"><span className="flex items-baseline gap-2">{dayHead(d)}</span></th>
                </tr>
                {d.rows.map((tr) => {
                  const pnl = tradePnl(tr);
                  const r = tradeR(tr);
                  return (
                    <tr key={tr.id} className="border-t border-zinc-800/70">
                      <td className="td text-[15px] font-bold whitespace-nowrap text-zinc-50 tabular-nums">{v.time(tr.openedAt)}</td>
                      <td className="td"><SidePill side={tr.direction} /></td>
                      <td className="td text-right text-zinc-300 tabular-nums">{tr.lots}</td>
                      <td className="td text-right text-zinc-300 tabular-nums">{px(tr.entryPrice)}</td>
                      <td className="td text-right tabular-nums">{tr.exitPrice !== null ? px(tr.exitPrice) : <span className="text-amber-400">{t("нээлттэй", "open")}</span>}</td>
                      <td className="td text-right">{pnl === null ? <span className="text-zinc-500">—</span> : <Pnl value={pnl} />}</td>
                      <td className="td text-right text-zinc-400 tabular-nums">{rText(r)}</td>
                      <td className="td max-w-xs truncate text-zinc-400">{tr.note}{tr.imageMime && imageTag}</td>
                      <td className="td text-right whitespace-nowrap">
                        <Link href={`/journal/${tr.id}`} className="mr-3 font-medium text-zinc-200 hover:text-zinc-50">{t("Засах", "Edit")}</Link>
                        <form action={deleteTradeAction} className="inline">
                          <input type="hidden" name="id" value={tr.id} />
                          <button className="text-red-400 hover:text-red-300">{t("Устгах", "Delete")}</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
        </>
      )}
    </div>
  );
}
