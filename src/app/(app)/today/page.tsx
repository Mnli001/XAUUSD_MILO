import { getTodaySnapshot } from "@/lib/snapshot";
import { SYMBOL, loadCandles } from "@/lib/ingest/prices";
import { ubHour, weekdayName, zoneWeekday } from "@/lib/time";
import { HourlyTable } from "@/components/HourlyTable";
import { PriceHeader, BiasBar, LevelsCard, Empty, BiasBarLocked, LevelsCardLocked } from "@/components/TodayCards";
import { SessionLine } from "@/components/SessionLine";
import { getEvents, getNextHighEvent, getReactions } from "@/lib/events";
import { Countdown } from "@/components/Countdown";
import { ReactionRows } from "@/components/NewsList";
import { eventTitle } from "@/lib/data/calendarProvider";
import { getT, getViewer, startGuideDone } from "@/lib/prefs.server";
import { StartGuide } from "@/components/StartGuide";
import { dismissStartGuide } from "@/lib/actions/startGuide";
import { ReasoningPanel, ReasoningLocked } from "@/components/ReasoningPanel";
import { requireUser } from "@/lib/auth";
import { paywallFor } from "@/lib/paywall.server";
import { lockedHourRows } from "@/lib/paywall";
import { PlansCard } from "@/components/Paywall";
import { choosePlanAction } from "@/lib/actions/payments";
import { getReasoning } from "@/lib/reasoningLive";
import { MyDashboard, type DashSetup } from "@/components/MyDashboard";
import { botSummary, journalSummary, latestPaidPlan, planSummary } from "@/lib/dashboard";
import { listTrades } from "@/lib/trades";
import { getSetups } from "@/lib/setup/build";
import { orderSetups } from "@/lib/setup/order";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Өнөөдөр — XAU Analytics", "Today — XAU Analytics") };
}

export default async function TodayPage() {
  const v = await getViewer();
  const { t } = v;
  const now = new Date();
  // Without a plan the paid figures are never loaded into the page, so they cannot be read from it.
  const user = await requireUser();
  const { paid, payOn, contact } = paywallFor(user, now);
  const [snap, upcoming, next, reactions, day, reasoning, guideDone, paidPlan, trades, bot, setupView] = await Promise.all([
    getTodaySnapshot(SYMBOL, now),
    getEvents(now, new Date(now.getTime() + 24 * 36e5)),
    getNextHighEvent(now),
    getReactions(),
    loadCandles(SYMBOL, "15min", 96),
    paid ? getReasoning(now, v.locale) : Promise.resolve(null),
    startGuideDone(),
    latestPaidPlan(user.id),
    listTrades(user.id),
    paid ? botSummary(user.id, now) : Promise.resolve(null),
    paid ? getSetups(now, v).catch((e) => { console.error("[today] setups failed", e); return null; }) : Promise.resolve(null),
  ]);
  const dashSetups: DashSetup[] | null = setupView
    ? orderSetups(setupView.setups).map((s) => ({ id: s.id, name: s.name, status: s.status, side: s.side, headline: s.headline, entry: s.entry, stop: s.stop, target: s.target }))
    : null;
  const highSoon = upcoming.filter((e) => e.impact === "HIGH").map((e) => ({ time: e.time, title: e.title, type: e.type }));
  return (
    <div className="reveal space-y-5 sm:space-y-7">
      {!paid && <PlansCard t={t} choose={choosePlanAction} payOn={payOn} contact={contact} compact />}
      <MyDashboard v={v} name={user.name || null} plan={planSummary(user, paidPlan, now)} journal={journalSummary(trades, now)} bot={bot} setups={paid ? dashSetups ?? [] : null} />
      {!guideDone && <StartGuide t={t} dismiss={dismissStartGuide} />}
      <section className="card group relative overflow-hidden sm:p-8 transition-all duration-500 hover:shadow-2xl" aria-labelledby="today-h">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-400/5 blur-3xl transition-all duration-700 group-hover:scale-150 group-hover:bg-amber-400/10" aria-hidden />
        
        <div className="relative z-10">
          <h1 id="today-h" className="sr-only">{t("Өнөөдөр", "Today")}</h1>
          <PriceHeader price={snap.price} closes={day.map((c) => c.close)} v={v} date={`${weekdayName(zoneWeekday(now, v.timeZone), t)} · ${v.date(now)}`} />
          <div className="mt-7 rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5 backdrop-blur-sm" style={{ borderColor: "var(--hairline)" }}>
            <SessionLine now={now} arrivals={highSoon.map((e) => ({ time: e.time, label: eventTitle(e, t) }))} v={v} />
          </div>
        </div>
      </section>

      {/* Phones read top to bottom: the side, the next release, the hours, the levels. Wide screens pair them in two columns. */}
      <div className="grid items-start gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5 sm:space-y-6">
            {paid ? <BiasBar bias={snap.bias} v={v} /> : <BiasBarLocked v={v} />}
            {paid ? <ReasoningPanel initial={reasoning} compact /> : <ReasoningLocked />}
        </div>
        <div className="min-w-0">
            <section className="card group relative overflow-hidden p-0 sm:p-0 transition-all duration-500 hover:shadow-2xl" aria-labelledby="next-h">
              {next ? (
                <>
                  <div className="sheen relative overflow-hidden px-6 py-6 sm:px-7" style={{ background: "var(--accent-bg)", color: "var(--accent-fg)" }}>
                    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-500/20 blur-3xl transition-all duration-1000 group-hover:scale-150" aria-hidden />
                    
                    <div className="relative z-10">
                      <div className="inline-flex items-center gap-2 rounded-xl bg-zinc-950/30 px-3 py-1.5 backdrop-blur-sm">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />
                        <span className="text-xs font-bold tracking-wider uppercase">{t("Дараагийн мэдээ", "Next Release")}</span>
                      </div>
                      
                      <h2 id="next-h" className="mt-4 text-xl leading-snug font-bold">
                        {eventTitle(next, t)}
                      </h2>
                      
                      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium tabular-nums">{v.time(next.time)} {v.zone}</p>
                          <p className="text-xs opacity-80">{v.date(next.time)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-medium opacity-80 uppercase tracking-wide">{t("Хүлээх хугацаа", "Time left")}</p>
                          <p className="text-[32px] leading-none font-extrabold tracking-tight tabular-nums">
                            <Countdown to={next.time.toISOString()} />
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="px-5 py-5 sm:px-6">
                    <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-zinc-400">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      {t("Өмнө нь ийм мэдээний дараа:", "After this kind of release before:")}
                    </p>
                    <ReactionRows stats={reactions.get(next.type)} v={v} />
                  </div>
                </>
              ) : (
                <div className="p-5 sm:p-6">
                  <h2 id="next-h" className="card-title">{t("Дараагийн чухал мэдээ", "Next key release")}</h2>
                  <p className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {t("Бүртгэгдсэн чухал мэдээ алга", "No important releases on record")}
                  </p>
                </div>
              )}
            </section>
        </div>
        <div className="min-w-0">
            {(paid ? snap.hourly : lockedHourRows()) ? (
              <section className="table-card overflow-hidden rounded-2xl border border-zinc-800/50 backdrop-blur-sm shadow-xl transition-shadow duration-300 hover:shadow-2xl" aria-labelledby="hours-h">
                <div className="bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 px-5 pt-5 pb-4 sm:px-6">
                  <h2 id="hours-h" className="flex items-center gap-2 text-base font-bold text-zinc-100">
                    <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {t("Цагийн хуваарь, дараагийн 24 цаг", "Hour by hour, next 24 hours")}
                  </h2>
                  <p className="mt-2 max-w-prose text-xs leading-relaxed text-zinc-500">
                    {t("Сүүлийн 6 сарын 1 цагийн лаанаас. Одоогийн трендтэй ижил нөхцөлтэй өдрүүдээр тооцно; түүвэр 30-аас цөөн бол хувь гаргахгүй.", "From the last 6 months of 1-hour candles. Counted over days with the same trend as now; no percentage is shown when the sample is under 30.")}
                  </p>
                </div>
                <HourlyTable rows={paid ? snap.hourly! : lockedHourRows()} nowHour={ubHour(now)} events={highSoon} v={v} locked={!paid} />
              </section>
            ) : <Empty title={t("Цагийн хуваарь", "Hour by hour")} v={v} />}
        </div>
        <div className="min-w-0 lg:sticky lg:top-8">
            {paid ? <LevelsCard levels={snap.levels} price={snap.price?.last} v={v} /> : <LevelsCardLocked v={v} />}
        </div>
      </div>
    </div>
  );
}
