import type { EconomicEvent } from "@/lib/db/schema";
import type { Reaction } from "@/lib/analysis/reaction";
import { weekdayName, zoneWeekday } from "@/lib/time";
import { eventTitle, countryName } from "@/lib/data/calendarProvider";
import type { T } from "@/lib/i18n";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";

const impactOf = (t: T) => ({ HIGH: ["bg-red-500", t("Өндөр", "High")], MEDIUM: ["bg-amber-400", t("Дунд", "Medium")], LOW: ["bg-zinc-500", t("Бага", "Low")] }) as const;

export function ReactionRows({ stats, v = MN_VIEWER }: { stats: Reaction[] | undefined; v?: Viewer }) {
  const { t } = v;
  if (!stats || stats.every((s) => s.avgAbsMove === null)) return <p className="text-sm text-zinc-500">{t("Түүхэн дата хангалтгүй", "Not enough history")}</p>;
  return (
    <ul className="space-y-1 text-sm text-zinc-300">
      {stats.map((s) => (
        <li key={s.minutes}>
          {s.minutes} {t("мин:", "min:")}{" "}
          {s.avgAbsMove === null || s.upPct === null ? <span className="text-zinc-500">{t("Түүхэн дата хангалтгүй (n=", "Not enough history (n=")}{s.n})</span>
            : <>{t("дундаж ±$", "average ±$")}{s.avgAbsMove.toFixed(1)}, {s.upPct}{t("% өссөн", "% rose")} <span className="text-zinc-500">(n={s.n})</span></>}
        </li>
      ))}
    </ul>
  );
}

export function NewsList({ events, reactions, now, v = MN_VIEWER }: { events: EconomicEvent[]; reactions: Map<string, Reaction[]>; now: Date; v?: Viewer }) {
  const { t } = v;
  const IMPACT = impactOf(t);
  if (events.length === 0) return <div className="card text-zinc-500">{t("Энэ хугацаанд бүртгэгдсэн мэдээ алга. Календарь өдөрт нэг удаа шинэчлэгдэнэ.", "No releases on record for this period. The calendar updates once a day.")}</div>;
  const days = new Map<string, EconomicEvent[]>();
  for (const e of events) days.set(v.date(e.time), [...(days.get(v.date(e.time)) ?? []), e]);
  return (
    <div className="space-y-4">
      {[...days].map(([day, list]) => (
        <section key={day} className="card">
          <h2 className="mb-1 flex items-baseline gap-2 text-sm font-medium text-zinc-200">{weekdayName(zoneWeekday(list[0].time, v.timeZone), t)}<span className="font-mono text-xs font-normal text-zinc-500">{day}</span></h2>
          <ul className="divide-y divide-zinc-800">
            {list.map((e) => (
              <li key={e.id} className={e.time < now ? "opacity-60" : ""}>
                <details>
                  <summary className="grid cursor-pointer grid-cols-[3.25rem_1fr] gap-x-3 gap-y-1 py-3 sm:grid-cols-[3.25rem_1fr_auto] sm:items-center">
                    <span className="font-mono text-zinc-200">{v.time(e.time)}</span>
                    <span className="min-w-0">
                      <span className="font-medium">{eventTitle(e, t)}</span>
                      <span className="ml-2 inline-flex items-center gap-1.5 align-middle text-xs whitespace-nowrap text-zinc-500"><span aria-hidden className={`h-2 w-2 rounded-full ${IMPACT[e.impact][0]}`} />{countryName(e.country, t)}{t(", нөлөө", ", impact")} {IMPACT[e.impact][1].toLowerCase()}</span>
                    </span>
                    <span className="col-start-2 grid grid-cols-3 gap-x-4 font-mono text-xs text-zinc-400 sm:col-start-3 sm:flex">
                      {([[t("Таамаг", "Forecast"), e.forecast], [t("Өмнөх", "Previous"), e.previous], [t("Бодит", "Actual"), e.actual]] as const).map(([k, val]) => <span key={k} className="whitespace-nowrap"><span className="text-zinc-500">{k}</span> {val ?? "—"}</span>)}
                    </span>
                  </summary>
                  <div className="pb-3 pl-[4rem]">
                    <p className="mb-1 text-xs text-zinc-500">{t("Өмнөх ийм мэдээний дараа алт хэрхэн хөдөлсөн бэ (сүүлийн 12 сар):", "How gold moved after this kind of release before (last 12 months):")}</p>
                    <ReactionRows stats={reactions.get(e.type)} v={v} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
