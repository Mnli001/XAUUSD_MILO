import type { EconomicEvent } from "@/lib/db/schema";
import type { Reaction } from "@/lib/analysis/reaction";
import { formatUbTime, ubDateKey, ubWeekday } from "@/lib/time";

const WEEKDAYS = ["", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба", "Ням"];
const IMPACT = { HIGH: ["bg-red-500", "Өндөр"], MEDIUM: ["bg-amber-400", "Дунд"], LOW: ["bg-zinc-500", "Бага"] } as const;

export function ReactionRows({ stats }: { stats: Reaction[] | undefined }) {
  if (!stats || stats.every((s) => s.avgAbsMove === null)) return <p className="text-sm text-zinc-500">Түүхэн дата хангалтгүй</p>;
  return (
    <ul className="space-y-1 text-sm text-zinc-300">
      {stats.map((s) => (
        <li key={s.minutes}>
          {s.minutes} мин:{" "}
          {s.avgAbsMove === null || s.upPct === null ? <span className="text-zinc-500">Түүхэн дата хангалтгүй (n={s.n})</span>
            : <>дундаж ±${s.avgAbsMove.toFixed(1)}, {s.upPct}% өссөн <span className="text-zinc-500">(n={s.n})</span></>}
        </li>
      ))}
    </ul>
  );
}

export function NewsList({ events, reactions, now }: { events: EconomicEvent[]; reactions: Map<string, Reaction[]>; now: Date }) {
  if (events.length === 0) return <div className="card text-zinc-500">Энэ хугацаанд бүртгэгдсэн мэдээ алга. Календарь өдөрт нэг удаа шинэчлэгдэнэ.</div>;
  const days = new Map<string, EconomicEvent[]>();
  for (const e of events) days.set(ubDateKey(e.time), [...(days.get(ubDateKey(e.time)) ?? []), e]);
  return (
    <div className="space-y-4">
      {[...days].map(([day, list]) => (
        <section key={day} className="card">
          <h2 className="mb-1 flex items-baseline gap-2 text-sm font-medium text-zinc-200">{WEEKDAYS[ubWeekday(list[0].time)]}<span className="font-mono text-xs font-normal text-zinc-500">{day}</span></h2>
          <ul className="divide-y divide-zinc-800">
            {list.map((e) => (
              <li key={e.id} className={e.time < now ? "opacity-60" : ""}>
                <details>
                  <summary className="grid cursor-pointer grid-cols-[3.25rem_1fr] gap-x-3 gap-y-1 py-3 sm:grid-cols-[3.25rem_1fr_auto] sm:items-center">
                    <span className="font-mono text-zinc-200">{formatUbTime(e.time)}</span>
                    <span className="min-w-0">
                      <span className="font-medium">{e.title}</span>
                      <span className="ml-2 inline-flex items-center gap-1.5 align-middle text-xs whitespace-nowrap text-zinc-500"><span aria-hidden className={`h-2 w-2 rounded-full ${IMPACT[e.impact][0]}`} />{e.country}, нөлөө {IMPACT[e.impact][1].toLowerCase()}</span>
                    </span>
                    <span className="col-start-2 grid grid-cols-3 gap-x-4 font-mono text-xs text-zinc-400 sm:col-start-3 sm:flex">
                      {([["Таамаг", e.forecast], ["Өмнөх", e.previous], ["Бодит", e.actual]] as const).map(([k, val]) => <span key={k} className="whitespace-nowrap"><span className="text-zinc-500">{k}</span> {val ?? "—"}</span>)}
                    </span>
                  </summary>
                  <div className="pb-3 pl-[4rem]">
                    <p className="mb-1 text-xs text-zinc-500">Өмнөх ийм мэдээний дараа алт хэрхэн хөдөлсөн бэ (сүүлийн 12 сар):</p>
                    <ReactionRows stats={reactions.get(e.type)} />
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
