import type { EconomicEvent } from "@/lib/db/schema";
import type { Reaction } from "@/lib/analysis/reaction";
import { weekdayName, zoneWeekday } from "@/lib/time";
import { eventTitle, countryName } from "@/lib/data/calendarProvider";
import type { T } from "@/lib/i18n";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";
import { SESSIONS } from "./SessionLine";
import { relativeText } from "@/lib/relativeTime";

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "11-р сарын 27" / "November 27" from a YYYY-MM-DD key. */
export const dayLabel = (key: string, t: T) => { const m = Number(key.slice(5, 7)), d = Number(key.slice(8, 10)); return t(`${m}-р сарын ${d}`, `${MONTHS_EN[m - 1]} ${d}`); };

/** Impact as a line badge: [badge fill, station ring, word]. */
const impactOf = (t: T) => ({
  HIGH: ["bg-red-500", "border-red-400", t("Өндөр", "High")],
  MEDIUM: ["bg-amber-400", "border-amber-400", t("Дунд", "Medium")],
  LOW: ["bg-zinc-500", "border-zinc-500", t("Бага", "Low")],
}) as const;

const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h + (m || 0) / 60; };
const mod24 = (h: number) => ((h % 24) + 24) % 24;
const at = (h: number) => `${(mod24(h) / 24) * 100}%`;
/** Splits [from, to) on a 24-hour ring into pieces that fit on one straight axis. */
function pieces(from: number, to: number): [number, number][] {
  const a = mod24(from), len = to - from;
  return a + len <= 24 ? [[a, a + len]] : [[a, 24], [0, a + len - 24]];
}

/** How gold moved after past releases of one kind: a three-row timetable of 15, 30 and 60 minutes. */
export function ReactionRows({ stats, v = MN_VIEWER }: { stats: Reaction[] | undefined; v?: Viewer }) {
  const { t } = v;
  if (!stats || stats.every((s) => s.avgAbsMove === null)) return <p className="text-sm text-zinc-500">{t("Түүхэн дата хангалтгүй", "Not enough history")}</p>;
  return (
    <table className="w-full max-w-sm border-collapse text-sm">
      <thead>
        <tr className="text-left text-[11px] text-zinc-500">
          <th className="pr-3 pb-1.5 font-medium">{t("Дараа", "After")}</th>
          <th className="pr-3 pb-1.5 text-right font-medium">{t("Дундаж хөдөлгөөн", "Avg move")}</th>
          <th className="pr-3 pb-1.5 font-medium">{t("Өссөн", "Rose")}</th>
          <th className="pb-1.5 text-right font-medium">n</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((s) => (
          <tr key={s.minutes} className="border-t border-zinc-800/70">
            <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-400 tabular-nums">{s.minutes} {t("мин", "min")}</td>
            {s.avgAbsMove === null || s.upPct === null ? (
              <td colSpan={2} className="py-1.5 pr-3 text-zinc-500">{t("Түүхэн дата хангалтгүй", "Not enough history")}</td>
            ) : (
              <>
                <td className="py-1.5 pr-3 text-right font-semibold whitespace-nowrap text-zinc-100 tabular-nums">±${s.avgAbsMove.toFixed(1)}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  <span className="flex items-center gap-2">
                    <span className="w-9 text-right font-semibold text-zinc-100 tabular-nums">{s.upPct}%</span>
                    <span aria-hidden className="flex h-[5px] w-10 overflow-hidden rounded-full bg-red-500/70"><span className="bg-emerald-500" style={{ width: `${s.upPct}%` }} /></span>
                  </span>
                </td>
              </>
            )}
            <td className="py-1.5 text-right whitespace-nowrap text-zinc-500 tabular-nums">
              {s.n > 0 && s.n < 10 ? (
                <span className="text-amber-400/90 font-medium" title={t("Түүвэр цөөн тул болгоомжтой хандана уу", "Small sample size, exercise caution")}>
                  n={s.n} ⚠
                </span>
              ) : (
                `n=${s.n}`
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One day's releases placed on the 24-hour line, over the three session colours. */
function DayAxis({ list, now, isToday, v }: { list: EconomicEvent[]; now: Date; isToday: boolean; v: Viewer }) {
  const IMPACT = impactOf(v.t);
  const shift = hm(v.ub("00:00"));
  return (
    <div aria-hidden className="px-4 sm:px-5">
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-zinc-800" />
        {SESSIONS.flatMap((s) => pieces(s.from + shift, s.to + shift).map(([a, b], i) => (
          <div key={`${s.key}${i}`} className="absolute top-1/2 h-[5px] -translate-y-1/2 rounded-full opacity-70" style={{ left: at(a), width: `${((b - a) / 24) * 100}%`, background: s.color }} />
        )))}
        {list.map((e) => (
          <span key={e.id} className={`absolute top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-zinc-900 ${IMPACT[e.impact][1]} ${e.time < now ? "opacity-45" : ""}`} style={{ left: at(hm(v.time(e.time))) }} />
        ))}
        {isToday && (
          <span className="absolute top-0.5 bottom-0.5 w-0.5 -translate-x-1/2 rounded-full bg-zinc-50" style={{ left: at(hm(v.time(now))) }} />
        )}
      </div>
      <div className="relative h-4 text-[11px] text-zinc-500 tabular-nums">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} className={`absolute ${h === 0 ? "" : h === 24 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${(h / 24) * 100}%` }}>{String(h).padStart(2, "0")}</span>
        ))}
      </div>
    </div>
  );
}

export function NewsList({ events, reactions, now, v = MN_VIEWER }: { events: EconomicEvent[]; reactions: Map<string, Reaction[]>; now: Date; v?: Viewer }) {
  const { t } = v;
  const IMPACT = impactOf(t);
  if (events.length === 0) return <div className="card text-sm text-zinc-500">{t("Энэ хугацаанд бүртгэгдсэн мэдээ алга. Календарь өдөрт нэг удаа шинэчлэгдэнэ.", "No releases on record for this period. The calendar updates once a day.")}</div>;
  const days = new Map<string, EconomicEvent[]>();
  const tomorrow = v.date(new Date(now.getTime() + 864e5));
  const nextHigh = events.find((e) => e.impact === "HIGH" && e.time >= now);
  for (const e of events) days.set(v.date(e.time), [...(days.get(v.date(e.time)) ?? []), e]);
  const today = v.date(now);
  const nextId = events.find((e) => e.time >= now)?.id;
  return (
    <div className="space-y-4 sm:space-y-5">
      {nextHigh && (
        <div className="card flex flex-wrap items-baseline gap-x-3 gap-y-1 border-red-500/30">
          <span className="text-xs font-semibold tracking-wide text-red-300 uppercase">{t("Дараагийн чухал мэдээ", "Next important release")}</span>
          <span className="text-[15px] font-semibold text-zinc-50">{eventTitle(nextHigh, t)}</span>
          <span className="text-sm text-zinc-300 tabular-nums">{dayLabel(v.date(nextHigh.time), t)}, {weekdayName(zoneWeekday(nextHigh.time, v.timeZone), t)} · {v.time(nextHigh.time)} ({v.zone})</span>
          <span className="text-sm font-semibold text-amber-300">{relativeText(nextHigh.time.getTime() - now.getTime(), t)}</span>
        </div>
      )}
      {[...days].map(([day, list]) => (
        <section key={day} className="card overflow-hidden px-0 pb-1 sm:px-0 sm:pb-1">
          <h2 className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 text-[15px] font-semibold text-zinc-100 sm:px-5">
            {dayLabel(day, t)}, {weekdayName(zoneWeekday(list[0].time, v.timeZone), t)}
            <span className="text-[13px] font-normal text-zinc-500 tabular-nums">{day}</span>
            {day === today && <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-300">{t("Өнөөдөр", "Today")}</span>}
            {day === tomorrow && <span className="rounded-full bg-zinc-500/15 px-2 py-0.5 text-xs font-semibold text-zinc-300">{t("Маргааш", "Tomorrow")}</span>}
            <span className="ml-auto text-xs font-normal text-zinc-500 tabular-nums">{list.length} {t("мэдээ", list.length === 1 ? "release" : "releases")}</span>
          </h2>
          <DayAxis list={list} now={now} isToday={day === today} v={v} />
          <ul className="mt-2">
            {list.map((e) => {
              const past = e.time < now;
              const next = e.id === nextId;
              return (
                <li key={e.id} className={`border-t border-zinc-800/70 ${next ? "bg-zinc-800/45" : ""}`}>
                  <details className="group">
                    <summary className={`grid cursor-pointer grid-cols-[4.75rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-zinc-800/30 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto_auto] sm:items-center sm:px-5 ${past ? "opacity-55" : ""}`}>
                      <span className="pt-px">
                        <span className={`block text-[15px] leading-tight font-semibold tabular-nums ${past ? "text-zinc-400" : "text-zinc-50"}`}>{v.time(e.time)}</span>
                        {(day === today || day === tomorrow) && <span className={`mt-0.5 block text-[11px] leading-tight ${next ? "font-semibold text-amber-400" : "text-zinc-500"}`}>{relativeText(e.time.getTime() - now.getTime(), t)}</span>}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-start gap-2">
                          <span aria-hidden className={`line-badge mt-[5px] ${IMPACT[e.impact][0]}`} />
                          <span className="text-[15px] leading-snug font-medium text-zinc-100">{eventTitle(e, t)}</span>
                        </span>
                        <span className="mt-0.5 block pl-[18px] text-xs text-zinc-500">{countryName(e.country, t)}{t(", нөлөө", ", impact")} {IMPACT[e.impact][2].toLowerCase()}</span>
                      </span>
                      <svg aria-hidden viewBox="0 0 12 12" className="mt-1 h-3 w-3 shrink-0 text-zinc-500 transition-transform group-open:rotate-180 sm:order-last sm:mt-0"><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span className="col-span-2 col-start-2 grid grid-cols-3 gap-x-3 pl-[18px] text-xs sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:flex sm:gap-x-5 sm:pl-0">
                        {([[t("Таамаг", "Forecast"), e.forecast], [t("Өмнөх", "Previous"), e.previous], [t("Бодит", "Actual"), e.actual]] as const).map(([k, val]) => (
                          <span key={k} className="min-w-0 sm:min-w-14 sm:text-right">
                            <span className="block text-[11px] text-zinc-500">{k}</span>
                            <span className="block truncate font-medium text-zinc-200 tabular-nums">{val ?? "—"}</span>
                          </span>
                        ))}
                      </span>
                    </summary>
                    <div className="px-4 pb-4 sm:px-5 sm:pl-[5.5rem]">
                      <p className="mb-2 text-xs text-zinc-500">{t("Өмнөх ийм мэдээний дараа алт хэрхэн хөдөлсөн бэ (сүүлийн 12 сар):", "How gold moved after this kind of release before (last 12 months):")}</p>
                      <ReactionRows stats={reactions.get(e.type)} v={v} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
