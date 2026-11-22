import type { HourRow } from "@/lib/analysis/hourly";
import { sessionLabel, ubHour } from "@/lib/time";
import { eventTitle } from "@/lib/data/calendarProvider";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";

const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Next 24 hours starting at the current UB hour. */
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
    <table className="w-full">
      <thead>
        <tr><th className="th">{t("Цаг", "Hour")}<span className="hidden sm:inline"> ({v.zone})</span></th><th className="th hidden sm:table-cell">{t("Сесс", "Session")}</th><th className="th">{t("Магадлал", "Odds")}</th><th className="th text-right"><span className="sm:hidden">{t("Дундаж", "Average")}</span><span className="hidden sm:inline">{t("Дундаж хөдөлгөөн", "Average move")}</span></th></tr>
      </thead>
      <tbody>
        {ordered.map((r) => {
          const cond = r.upPctCond !== null;
          const pct = cond ? r.upPctCond : r.upPct;
          const n = cond ? r.nCond : r.n;
          return (
            <tr key={r.hour} className="border-t border-zinc-800">
              <td className="td w-px align-top font-mono whitespace-nowrap sm:align-middle" data-testid="hour">{v.ub(pad(r.hour))}</td>
              <td className="td hidden text-zinc-400 sm:table-cell">{sessionLabel(r.session, t)}</td>
              <td className="td">
                <span className="mb-0.5 block text-xs text-zinc-500 sm:hidden">{sessionLabel(r.session, t)}</span>
                {pct === null ? (
                  <span className="text-zinc-500">{t("Дата хангалтгүй", "Not enough data")}</span>
                ) : pct >= 50 ? (
                  <span className="whitespace-nowrap text-emerald-400">▲ {pct}{t("% өсөх", "% up")}</span>
                ) : (
                  <span className="whitespace-nowrap text-red-400">▼ {100 - pct}{t("% унах", "% down")}</span>
                )}
                <span className="ml-2 whitespace-nowrap text-xs text-zinc-500">n={n}{pct !== null && !cond ? t(" · бүх өдөр", " · all days") : ""}</span>
                {newsHours.has(r.hour) && <span className="ml-2 whitespace-nowrap text-xs text-amber-400" title={newsHours.get(r.hour)}>{t("⚠ мэдээ", "⚠ news")}</span>}
              </td>
              <td className="td text-right font-mono whitespace-nowrap text-zinc-400">{r.avgMove === null ? "—" : `±$${r.avgMove.toFixed(1)}`}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
