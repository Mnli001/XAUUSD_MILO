import { requireAdmin } from "@/lib/auth";
import { getEvents } from "@/lib/events";
import { EVENT_TYPES } from "@/lib/data/calendarProvider";
import { deleteEventAction } from "@/lib/actions/admin";
import { EventForm } from "@/components/EventForm";
import { formatUbDateTime, ubDateKey, formatUbTime, ubWeekday, weekdayName } from "@/lib/time";
import { getT } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  await requireAdmin(); // the layout's check does not guard this page: layouts do not re-run on navigation
  const t = await getT();
  const now = new Date();
  const events = await getEvents(new Date(now.getTime() - 2 * 864e5), new Date(now.getTime() + 60 * 864e5));
  const types = EVENT_TYPES.map(({ type, title }) => ({ type, title }));
  // A timetable of arrivals: one block per UB day, high-impact releases marked like the arrivals on Today.
  const days: { date: string; first: Date; rows: typeof events }[] = [];
  for (const e of events) {
    const date = ubDateKey(e.time);
    let day = days.at(-1);
    if (!day || day.date !== date) days.push((day = { date, first: e.time, rows: [] }));
    day.rows.push(e);
  }
  const impactMark = (impact: string) => (
    <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px] ${impact === "HIGH" ? "bg-amber-400" : impact === "MEDIUM" ? "border-2 border-amber-400" : "border-2 border-zinc-600"}`} />
  );
  const impactText = (impact: string) => (impact === "HIGH" ? t("Өндөр", "High") : impact === "MEDIUM" ? t("Дунд", "Medium") : t("Бага", "Low"));
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Мэдээний календарь", "News calendar")}</h1>
        <p className="page-lede">{t("CPI, NFP, ДНБ, PCE, PPI, жижиглэн худалдааны огноо, мөн гарсны дараа бодит ба өмнөх тоо нь FRED-ээс автоматаар орно (цаг тутам шалгана). Таамгийг энд гараар оруулна: тэгвэл site бодит тоо таамгаас дээш/доош гарсан үед алт хэрхэн хөдөлснийг тооцно.", "CPI, NFP, GDP, PCE, PPI and retail sales dates, and their actual and previous figures once released, come in automatically from FRED (checked hourly). Enter the forecast here by hand: the site then measures how gold moved when the actual came in above or below it.")}</p>
      </div>
      <section className="card" aria-labelledby="add-h">
        <h2 id="add-h" className="mb-3 text-[15px] font-semibold text-zinc-100">{t("Шинэ мэдээ нэмэх", "Add a release")}</h2>
        <EventForm types={types} initial={{ type: "FOMC", title: EVENT_TYPES.find((e) => e.type === "FOMC")!.title, ubDate: ubDateKey(now), ubTime: "03:00", impact: "HIGH", forecast: "", previous: "", actual: "" }} />
      </section>
      {events.length === 0 ? <div className="card text-sm text-zinc-400">{t("Ойрын 60 хоногт бүртгэгдсэн мэдээ алга.", "No releases on record for the next 60 days.")}</div> : (
        <div className="table-card">
          {days.map((d) => (
            <section key={d.date} aria-label={d.date} className="border-t border-zinc-800 first:border-t-0">
              <h2 className="flex items-baseline gap-2 bg-zinc-950/40 px-4 py-2 text-[13px] sm:px-5">
                <span className="font-semibold text-zinc-100 tabular-nums">{d.date}</span>
                <span className="text-zinc-500">{weekdayName(ubWeekday(d.first), t)}</span>
              </h2>
              {d.rows.map((e) => {
                const past = e.time.getTime() < now.getTime();
                return (
                  <details key={e.id} className="group border-t border-zinc-800/70">
                    <summary className={`grid cursor-pointer grid-cols-[3.25rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-4 py-3 hover:bg-zinc-800/40 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto_auto] sm:items-center sm:px-5 ${past ? "opacity-60" : ""}`}>
                      <span className="text-[15px] font-bold text-zinc-50 tabular-nums">{formatUbTime(e.time)}</span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">{impactMark(e.impact)}<span className="truncate font-medium text-zinc-100">{e.title}</span></span>
                        <span className="mt-0.5 block text-xs text-zinc-500">{e.type} · {e.source === "admin" ? t("гараар", "manual") : "FRED"} · {impactText(e.impact)}</span>
                      </span>
                      <span className="col-start-2 flex flex-wrap gap-x-4 text-xs text-zinc-400 tabular-nums sm:col-start-auto">
                        {([[t("Таамаг", "Forecast"), e.forecast], [t("Өмнөх", "Previous"), e.previous], [t("Бодит", "Actual"), e.actual]] as const).map(([k, val]) => <span key={k} className="whitespace-nowrap"><span className="text-zinc-500">{k}</span> <span className="text-zinc-200">{val ?? "—"}</span></span>)}
                      </span>
                      <svg aria-hidden viewBox="0 0 12 12" className="col-start-3 row-start-1 mt-1.5 h-3 w-3 text-zinc-500 transition-transform group-open:rotate-180 sm:col-start-4 sm:mt-0"><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </summary>
                    <div className="space-y-3 border-t border-zinc-800/70 bg-zinc-950/30 px-4 py-4 sm:px-5">
                      <p className="text-xs text-zinc-500 tabular-nums">{formatUbDateTime(e.time)} ({t("УБ", "UB")})</p>
                      <EventForm types={types} initial={{ id: e.id, type: e.type, title: e.title, ubDate: ubDateKey(e.time), ubTime: formatUbTime(e.time), impact: e.impact, forecast: e.forecast ?? "", previous: e.previous ?? "", actual: e.actual ?? "" }} />
                      <form action={deleteEventAction}><input type="hidden" name="id" value={e.id} /><button className="min-h-11 text-sm text-red-400 hover:text-red-300 sm:min-h-8">{t("Энэ мэдээг устгах", "Delete this release")}</button></form>
                    </div>
                  </details>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
