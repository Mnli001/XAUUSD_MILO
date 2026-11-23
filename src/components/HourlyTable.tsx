import type { HourRow } from "@/lib/analysis/hourly";
import { sessionLabel, ubHour } from "@/lib/time";
import { eventTitle } from "@/lib/data/calendarProvider";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";
import { sessionColor } from "./SessionLine";
import { Dir } from "./Timetable";

const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Next 24 hours starting at the current UB hour, set like a departures board: one row per hour. */
export function HourlyTable({ rows, nowHour, events, v = MN_VIEWER }: { rows: HourRow[]; nowHour: number; events: { time: Date; title: string; type?: string }[]; v?: Viewer }) {
  const { t } = v;
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  const newsHours = new Map<number, string>();
  for (const e of events) {
    const at = new Date(e.time).getTime();
    for (const h of [ubHour(new Date(at - 30 * 6e4)), ubHour(new Date(at + 30 * 6e4))]) newsHours.set(h, e.type ? eventTitle({ type: e.type, title: e.title }, t) : e.title);
  }
  const ordered = Array.from({ length: 24 }, (_, i) => (nowHour + i) % 24).map((h) => byHour.get(h)).filter((r): r is HourRow => !!r);

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-zinc-800">
          <th className="th">{t("Цаг", "Hour")}<span className="font-normal"> · {v.zone}</span></th>
          <th className="th hidden sm:table-cell">{t("Сешн", "Session")}</th>
          <th className="th">{t("Магадлал", "Odds")}</th>
          <th className="th text-right"><span className="sm:hidden">{t("Дундаж", "Average")}</span><span className="hidden sm:inline">{t("Дундаж хөдөлгөөн", "Average move")}</span></th>
        </tr>
      </thead>
      <tbody>
        {ordered.map((r, i) => {
          const cond = r.upPctCond !== null;
          const pct = cond ? r.upPctCond : r.upPct;
          const n = cond ? r.nCond : r.n;
          const now = i === 0;
          return (
            <tr key={r.hour} className={`border-t border-zinc-800/70 first:border-t-0 ${now ? "bg-zinc-800/45" : ""}`}>
              <td className="td w-px whitespace-nowrap">
                <span className="flex items-center gap-2.5">
                  <span aria-hidden className="h-6 w-[5px] rounded-full" style={{ background: sessionColor(r.session) }} />
                  <span className="text-[15px] font-semibold text-zinc-50 tabular-nums" data-testid="hour">{v.ub(pad(r.hour))}</span>
                  <span className="sr-only sm:hidden">{sessionLabel(r.session, t)}</span>
                  {now && <span className="text-[11px] font-semibold text-amber-400">{t("одоо", "now")}</span>}
                </span>
              </td>
              <td className="td hidden text-zinc-300 sm:table-cell">{sessionLabel(r.session, t)}</td>
              <td className="td">
                <span className="flex items-center gap-x-3">
                  {pct === null ? (
                    <span className="text-zinc-500">{t("Дата хангалтгүй", "Not enough data")}</span>
                  ) : pct >= 50 ? (
                    <span className="font-semibold whitespace-nowrap text-emerald-400"><Dir d={1} /> {pct}{t("% өсөх", "% up")}</span>
                  ) : (
                    <span className="font-semibold whitespace-nowrap text-red-400"><Dir d={-1} /> {100 - pct}{t("% унах", "% down")}</span>
                  )}
                  {pct !== null && (
                    <span aria-hidden className="hidden h-[5px] w-20 overflow-hidden rounded-full bg-red-500/70 md:flex">
                      <span className="bg-emerald-500" style={{ width: `${pct}%` }} />
                    </span>
                  )}
                  {/* Sample size: always on wide screens; on phones only when it falls back to all days. */}
                  <span className={`text-xs whitespace-nowrap text-zinc-500 ${pct !== null && cond ? "max-sm:sr-only" : ""}`}>n={n}{pct !== null && !cond ? t(" · бүх өдөр", " · all days") : ""}</span>
                  {newsHours.has(r.hour) && (
                    <span data-testid="news-flag" className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-1.5 py-1 text-xs font-medium whitespace-nowrap text-amber-300 sm:px-2 sm:py-0.5" title={newsHours.get(r.hour)}>
                      <span aria-hidden className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-amber-400" /><span className="max-sm:sr-only">{t("мэдээ", "news")}</span>
                    </span>
                  )}
                </span>
              </td>
              <td className="td text-right whitespace-nowrap text-zinc-400 tabular-nums">{r.avgMove === null ? "—" : `±$${r.avgMove.toFixed(1)}`}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
