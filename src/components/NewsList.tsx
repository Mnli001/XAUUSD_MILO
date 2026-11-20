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
          <h2 className="mb-2 text-sm font-medium text-zinc-400">{day} · {WEEKDAYS[ubWeekday(list[0].time)]}</h2>
          <ul className="divide-y divide-zinc-800">
            {list.map((e) => (
              <li key={e.id} className={e.time < now ? "opacity-60" : ""}>
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="font-mono">{formatUbTime(e.time)}</span>
                    <span className={`h-2.5 w-2.5 rounded-full ${IMPACT[e.impact][0]}`} title={`Нөлөөлөл: ${IMPACT[e.impact][1]}`} />
                    <span className="font-medium">{e.title}</span>
                    <span className="text-xs text-zinc-500">{e.country} · {IMPACT[e.impact][1]}</span>
                    <span className="ml-auto text-xs text-zinc-400">
                      Таамаг {e.forecast ?? "—"} · Өмнөх {e.previous ?? "—"} · Бодит {e.actual ?? "—"}
                    </span>
                  </summary>
                  <div className="pb-3 pl-2">
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
