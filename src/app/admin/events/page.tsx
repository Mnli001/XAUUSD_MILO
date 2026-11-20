import { getEvents } from "@/lib/events";
import { EVENT_TYPES } from "@/lib/data/calendarProvider";
import { deleteEventAction } from "@/lib/actions/admin";
import { EventForm } from "@/components/EventForm";
import { formatUbDateTime, ubDateKey, formatUbTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const now = new Date();
  const events = await getEvents(new Date(now.getTime() - 2 * 864e5), new Date(now.getTime() + 60 * 864e5));
  const types = EVENT_TYPES.map(({ type, title }) => ({ type, title }));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Мэдээний календарь</h1>
      <div className="card">
        <h2 className="mb-3 text-sm font-medium text-zinc-400">Шинэ мэдээ нэмэх</h2>
        <EventForm types={types} initial={{ type: "FOMC", title: "ХНС-ийн бодлогын хүү (FOMC)", ubDate: ubDateKey(now), ubTime: "03:00", impact: "HIGH", forecast: "", previous: "", actual: "" }} />
        <p className="mt-3 text-xs text-zinc-500">CPI, NFP, ДНБ, PCE, PPI, жижиглэн худалдааны огноо FRED-ээс автоматаар орно. FOMC болон таамаг/бодит тоог энд гараар оруулна.</p>
      </div>
      {events.length === 0 ? <div className="card text-zinc-400">Ойрын 60 хоногт бүртгэгдсэн мэдээ алга.</div> : events.map((e) => (
        <details key={e.id} className="card">
          <summary className="flex cursor-pointer flex-wrap items-center gap-3">
            <span className="font-mono">{formatUbDateTime(e.time)}</span>
            <span className="font-medium">{e.title}</span>
            <span className="text-xs text-zinc-500">{e.type} · {e.source === "admin" ? "гараар" : "FRED"}</span>
            <span className="ml-auto text-xs text-zinc-400">Таамаг {e.forecast ?? "—"} · Өмнөх {e.previous ?? "—"} · Бодит {e.actual ?? "—"}</span>
          </summary>
          <div className="mt-4 space-y-3">
            <EventForm types={types} initial={{ id: e.id, type: e.type, title: e.title, ubDate: ubDateKey(e.time), ubTime: formatUbTime(e.time), impact: e.impact, forecast: e.forecast ?? "", previous: e.previous ?? "", actual: e.actual ?? "" }} />
            <form action={deleteEventAction}><input type="hidden" name="id" value={e.id} /><button className="text-sm text-red-400">Энэ мэдээг устгах</button></form>
          </div>
        </details>
      ))}
    </div>
  );
}
