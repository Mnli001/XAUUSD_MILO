import type { T } from "@/lib/i18n";
import type { Viewer } from "@/lib/viewer";
import type { SignalRow } from "@/lib/signalHistory";
import { outcomeTotals, type Outcome } from "@/lib/signalOutcome";
import { Dir } from "./Timetable";
import { stamp } from "@/lib/siteCopy";

const px = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rText = (r: number) => `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}R`;

type Look = { result: "win" | "loss" | "open"; row: string; badge: string; word: string };

/** Green for money made, red for money lost, grey while open. The word always says it too. */
function lookOf(o: Outcome, t: T): Look {
  if (o.kind === "OPEN" || o.r === null) return { result: "open", row: "", badge: "border border-zinc-700 text-zinc-300", word: t("Нээлттэй", "Open") };
  const won = o.r > 0;
  const word = o.kind === "WIN" ? t("Target-д хүрсэн", "Target") : o.kind === "LOSS" ? t("Stop-д хүрсэн", "Stop") : t("Цагаар", "On time");
  return won
    ? { result: "win", row: "bg-emerald-500/[0.07] shadow-[inset_3px_0_0_var(--color-emerald-400)]", badge: "bg-emerald-500/15 text-emerald-300", word }
    : { result: "loss", row: "bg-red-500/[0.07] shadow-[inset_3px_0_0_var(--color-red-400)]", badge: "bg-red-500/15 text-red-300", word };
}

/** `caption` names the window the totals cover ("Last 60 signals"), the same on every page. */
export function SignalTotals({ rows, t, caption }: { rows: SignalRow[]; t: T; caption?: string }) {
  const s = outcomeTotals(rows.map((r) => r.outcome));
  return (
    <div>
    {caption && <p className="mb-2 text-xs font-semibold text-zinc-400">{caption}</p>}
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {([
        [t("Нийт үр дүн", "Total result"), <span key="r" className={s.totalR > 0 ? "text-emerald-400" : s.totalR < 0 ? "text-red-400" : "text-zinc-200"}>{rText(s.totalR)}</span>],
        [t("Ашигтай", "In profit"), <span key="w" className="text-emerald-400">{t(`${s.wins} ашигтай`, `${s.wins} in profit`)}</span>],
        [t("Алдагдалтай", "At a loss"), <span key="l" className="text-red-400">{t(`${s.losses} алдагдалтай`, `${s.losses} at a loss`)}</span>],
        [t("Хүлээгдэж буй", "Still open"), <span key="o" className="text-zinc-300">{t(`${s.open} нээлттэй`, `${s.open} open`)}</span>],
      ] as const).map(([label, value]) => (
        <div key={label} className="rounded-2xl border p-4" style={{ borderColor: "var(--hairline)", background: "var(--glass-inset)" }}>
          <dt className="text-xs font-semibold text-zinc-400">{label}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
    </div>
  );
}

export function SignalHistoryTable({ rows, v, now = new Date() }: { rows: SignalRow[]; v: Viewer; now?: Date }) {
  const { t } = v;
  if (rows.length === 0) return <p className="px-4 pb-4 text-sm text-zinc-500 sm:px-5 sm:pb-5">{t("Одоогоор дохио гараагүй. Setup идэвхжих бүрд энд бүртгэгдэж, хэрхэн дууссан нь гарна.", "No signals yet. Each time a setup becomes active it is recorded here with how it ended.")}</p>;
  const head: [string, string][] = [[`${t("Гарсан", "Time")} (${v.zone})`, ""], [t("Чиглэл", "Side"), "sr-only-head"], [t("Дүрэм", "Rule"), "hidden md:table-cell"], [t("Орох", "Entry"), "text-right"], ["Stop", "hidden sm:table-cell text-right"], ["Target", "hidden sm:table-cell text-right"], [t("Үр дүн", "Result"), "text-right"]];
  return (
    <table className="w-full border-collapse">
      <thead><tr className="border-b border-zinc-800">{head.map(([h, cls], i) => <th key={i} className={cls === "sr-only-head" ? "th" : `th ${cls}`}>{cls === "sr-only-head" ? <span className="sr-only">{h}</span> : h}</th>)}</tr></thead>
      <tbody>
        {rows.map((g) => {
          const look = lookOf(g.outcome, t);
          return (
            <tr key={g.id} data-result={look.result} className={`border-t border-zinc-800/70 first:border-t-0 ${look.row}`}>
              <td className="td whitespace-nowrap text-zinc-400 tabular-nums">{stamp(v, g.createdAt, now)}</td>
              <td className={`td font-semibold whitespace-nowrap ${g.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}><Dir d={g.side === "BUY" ? 1 : -1} /> {g.side}</td>
              <td className="td hidden text-zinc-300 md:table-cell">{g.name}</td>
              <td className="td text-right font-medium text-zinc-100 tabular-nums">{px(g.entry)}</td>
              <td className="td hidden text-right text-zinc-400 tabular-nums sm:table-cell">{px(g.stop)}</td>
              <td className="td hidden text-right text-zinc-400 tabular-nums sm:table-cell">{px(g.target)}</td>
              <td className="td text-right">
                <span className={`inline-flex flex-col items-end gap-x-1.5 rounded-lg px-2 py-1 text-xs font-bold whitespace-nowrap sm:flex-row sm:items-center ${look.badge}`}>
                  <span>{look.word}</span>
                  {g.outcome.r !== null && <span className="tabular-nums">{rText(g.outcome.r)}</span>}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
