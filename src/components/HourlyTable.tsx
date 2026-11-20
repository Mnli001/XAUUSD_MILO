import type { HourRow } from "@/lib/analysis/hourly";
import { ubHour } from "@/lib/time";

const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Next 24 hours starting at the current UB hour. */
export function HourlyTable({ rows, nowHour, events }: { rows: HourRow[]; nowHour: number; events: { time: Date; title: string }[] }) {
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  const newsHours = new Map<number, string>();
  for (const e of events) {
    const t = new Date(e.time).getTime();
    for (const h of [ubHour(new Date(t - 30 * 6e4)), ubHour(new Date(t + 30 * 6e4))]) newsHours.set(h, e.title);
  }
  const ordered = Array.from({ length: 24 }, (_, i) => (nowHour + i) % 24).map((h) => byHour.get(h)).filter((r): r is HourRow => !!r);

  return (
    <table className="w-full">
      <thead>
        <tr><th className="th">Цаг (УБ)</th><th className="th">Сесс</th><th className="th">Магадлал</th><th className="th">Дундаж хөдөлгөөн</th></tr>
      </thead>
      <tbody>
        {ordered.map((r) => {
          const cond = r.upPctCond !== null;
          const pct = cond ? r.upPctCond : r.upPct;
          const n = cond ? r.nCond : r.n;
          return (
            <tr key={r.hour} className="border-t border-zinc-800">
              <td className="td font-mono" data-testid="hour">{pad(r.hour)}</td>
              <td className="td text-zinc-400">{r.session}</td>
              <td className="td">
                {pct === null ? (
                  <span className="text-zinc-500">Дата хангалтгүй</span>
                ) : pct >= 50 ? (
                  <span className="text-emerald-400">▲ {pct}% өсөх</span>
                ) : (
                  <span className="text-red-400">▼ {100 - pct}% унах</span>
                )}
                <span className="ml-2 text-xs text-zinc-500">n={n}{pct !== null && !cond ? " · бүх өдөр" : ""}</span>
                {newsHours.has(r.hour) && <span className="ml-2 text-xs text-amber-400" title={newsHours.get(r.hour)}>⚠ мэдээ</span>}
              </td>
              <td className="td text-zinc-400">{r.avgMove === null ? "—" : `±$${r.avgMove.toFixed(1)}`}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
