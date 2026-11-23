import { getTodaySnapshot } from "@/lib/snapshot";
import { SYMBOL, loadCandles } from "@/lib/ingest/prices";
import { ubHour, weekdayName, zoneWeekday } from "@/lib/time";
import { HourlyTable } from "@/components/HourlyTable";
import { PriceHeader, BiasBar, LevelsCard, Empty } from "@/components/TodayCards";
import { SessionLine } from "@/components/SessionLine";
import { getEvents, getNextHighEvent, getReactions } from "@/lib/events";
import { Countdown } from "@/components/Countdown";
import { ReactionRows } from "@/components/NewsList";
import { eventTitle } from "@/lib/data/calendarProvider";
import { getT, getViewer } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Өнөөдөр — XAU Analytics", "Today — XAU Analytics") };
}

export default async function TodayPage() {
  const v = await getViewer();
  const { t } = v;
  const now = new Date();
  const [snap, upcoming, next, reactions, day] = await Promise.all([
    getTodaySnapshot(SYMBOL, now),
    getEvents(now, new Date(now.getTime() + 24 * 36e5)),
    getNextHighEvent(now),
    getReactions(),
    loadCandles(SYMBOL, "15min", 96),
  ]);
  const highSoon = upcoming.filter((e) => e.impact === "HIGH").map((e) => ({ time: e.time, title: e.title, type: e.type }));
  return (
    <div className="reveal space-y-4 sm:space-y-6">
      <section className="card sm:p-8" aria-labelledby="today-h">
        <h1 id="today-h" className="sr-only">{t("Өнөөдөр", "Today")}</h1>
        <PriceHeader price={snap.price} closes={day.map((c) => c.close)} v={v} date={`${weekdayName(zoneWeekday(now, v.timeZone), t)} · ${v.date(now)}`} />
        <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--hairline)" }}>
          <SessionLine now={now} arrivals={highSoon.map((e) => ({ time: e.time, label: eventTitle(e, t) }))} v={v} />
        </div>
      </section>

      {/* Phones read top to bottom: the side, the next release, the hours, the levels. Wide screens pair them in two columns. */}
      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
            <BiasBar bias={snap.bias} v={v} />
        </div>
        <div className="min-w-0">
            <section className="card overflow-hidden p-0 sm:p-0" aria-labelledby="next-h">
              {next ? (
                <>
                  <div className="sheen px-5 py-5 sm:px-6" style={{ background: "var(--accent-bg)", color: "var(--accent-fg)" }}>
                    <h2 id="next-h" className="text-lg leading-snug font-bold"><span className="font-medium">{t("Дараагийн мэдээ:", "Next release:")}</span> {eventTitle(next, t)}</h2>
                    <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                      <span className="text-sm font-medium whitespace-nowrap tabular-nums">{v.time(next.time)} {v.zone}<span className="block text-xs opacity-80">{v.date(next.time)}</span></span>
                      <span className="text-[28px] leading-none font-extrabold tracking-[-0.02em] whitespace-nowrap"><Countdown to={next.time.toISOString()} /></span>
                    </div>
                  </div>
                  <div className="px-4 py-4 sm:px-5">
                    <p className="mb-2 text-xs text-zinc-500">{t("Өмнө нь ийм мэдээний дараа:", "After this kind of release before:")}</p>
                    <ReactionRows stats={reactions.get(next.type)} v={v} />
                  </div>
                </>
              ) : (
                <div className="p-4 sm:p-5">
                  <h2 id="next-h" className="card-title">{t("Дараагийн чухал мэдээ", "Next key release")}</h2>
                  <p className="text-sm text-zinc-500">{t("Бүртгэгдсэн чухал мэдээ алга", "No important releases on record")}</p>
                </div>
              )}
            </section>
        </div>
        <div className="min-w-0">
            {snap.hourly ? (
              <section className="table-card" aria-labelledby="hours-h">
                <div className="px-4 pt-4 pb-2 sm:px-5 sm:pt-5">
                  <h2 id="hours-h" className="text-[15px] font-semibold text-zinc-100">{t("Цагийн хуваарь, дараагийн 24 цаг", "Hour by hour, next 24 hours")}</h2>
                  <p className="mt-1 max-w-prose text-xs leading-relaxed text-zinc-500">{t("Сүүлийн 6 сарын 1 цагийн лаанаас. Одоогийн трендтэй ижил нөхцөлтэй өдрүүдээр тооцно; түүвэр 30-аас цөөн бол хувь гаргахгүй.", "From the last 6 months of 1-hour candles. Counted over days with the same trend as now; no percentage is shown when the sample is under 30.")}</p>
                </div>
                <HourlyTable rows={snap.hourly} nowHour={ubHour(now)} events={highSoon} v={v} />
              </section>
            ) : <Empty title={t("Цагийн хуваарь", "Hour by hour")} v={v} />}
        </div>
        <div className="min-w-0 lg:sticky lg:top-8">
            <LevelsCard levels={snap.levels} price={snap.price?.last} v={v} />
        </div>
      </div>
    </div>
  );
}
