import { getEvents } from "@/lib/events";
import { EVENT_TYPES } from "@/lib/data/calendarProvider";
import { deleteEventAction } from "@/lib/actions/admin";
import { EventForm } from "@/components/EventForm";
import { formatUbDateTime, ubDateKey, formatUbTime } from "@/lib/time";
import { getT } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const t = await getT();
  const now = new Date();
  const events = await getEvents(new Date(now.getTime() - 2 * 864e5), new Date(now.getTime() + 60 * 864e5));
  const types = EVENT_TYPES.map(({ type, title }) => ({ type, title }));
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("Мэдээний календарь", "News calendar")}</h1>
      <div className="card">
        <h2 className="card-title">{t("Шинэ мэдээ нэмэх", "Add a release")}</h2>
        <EventForm types={types} initial={{ type: "FOMC", title: EVENT_TYPES.find((e) => e.type === "FOMC")!.title, ubDate: ubDateKey(now), ubTime: "03:00", impact: "HIGH", forecast: "", previous: "", actual: "" }} />
        <p className="mt-3 max-w-prose text-xs leading-relaxed text-zinc-500">{t("CPI, NFP, ДНБ, PCE, PPI, жижиглэн худалдааны огноо FRED-ээс автоматаар орно. FOMC болон таамаг/бодит тоог энд гараар оруулна.", "CPI, NFP, GDP, PCE, PPI and retail sales dates come in automatically from FRED. FOMC and the forecast/actual figures are entered here by hand.")}</p>
      </div>
      {events.length === 0 ? <div className="card text-zinc-400">{t("Ойрын 60 хоногт бүртгэгдсэн мэдээ алга.", "No releases on record for the next 60 days.")}</div> : events.map((e) => (
        <details key={e.id} className="card">
          <summary className="grid cursor-pointer gap-x-4 gap-y-1 sm:grid-cols-[9.5rem_1fr_auto] sm:items-center">
            <span className="font-mono text-sm text-zinc-400">{formatUbDateTime(e.time)}</span>
            <span className="min-w-0"><span className="font-medium">{e.title}</span><span className="ml-2 text-xs whitespace-nowrap text-zinc-500">{e.type}, {e.source === "admin" ? t("гараар", "manual") : "FRED"}</span></span>
            <span className="flex flex-wrap gap-x-4 font-mono text-xs text-zinc-400">
              {([[t("Таамаг", "Forecast"), e.forecast], [t("Өмнөх", "Previous"), e.previous], [t("Бодит", "Actual"), e.actual]] as const).map(([k, val]) => <span key={k} className="whitespace-nowrap"><span className="text-zinc-500">{k}</span> {val ?? "—"}</span>)}
            </span>
          </summary>
          <div className="mt-4 space-y-3">
            <EventForm types={types} initial={{ id: e.id, type: e.type, title: e.title, ubDate: ubDateKey(e.time), ubTime: formatUbTime(e.time), impact: e.impact, forecast: e.forecast ?? "", previous: e.previous ?? "", actual: e.actual ?? "" }} />
            <form action={deleteEventAction}><input type="hidden" name="id" value={e.id} /><button className="text-sm text-red-400">{t("Энэ мэдээг устгах", "Delete this release")}</button></form>
          </div>
        </details>
      ))}
    </div>
  );
}
