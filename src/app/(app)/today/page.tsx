import { getTodaySnapshot } from "@/lib/snapshot";
import { SYMBOL, loadCandles } from "@/lib/ingest/prices";
import { ubHour, weekdayName, zoneWeekday } from "@/lib/time";
import { PriceCard, DirectionCard, DirectionCardLocked, NextReleaseCard, KeyLevels, KeyLevelsLocked, hourCells } from "@/components/TodayCards";
import { HourStrip } from "@/components/HourStrip";
import { getEvents, getNextHighEvent, getReactions } from "@/lib/events";
import { getT, getViewer } from "@/lib/prefs.server";
import { ReasoningPanel, ReasoningLocked } from "@/components/ReasoningPanel";
import { requireUser } from "@/lib/auth";
import { paywallFor } from "@/lib/paywall.server";
import { lockedHourRows } from "@/lib/paywall";
import { PlansCard } from "@/components/Paywall";
import { choosePlanAction } from "@/lib/actions/payments";
import { getReasoning } from "@/lib/reasoningLive";
import { AccountChips, SetupsCard, type DashSetup } from "@/components/MyDashboard";
import { botSummary, tradeSummary, latestPaidPlan, planSummary } from "@/lib/dashboard";
import { botTrades } from "@/lib/botPerformance";
import { getSetups } from "@/lib/setup/build";
import { orderSetups } from "@/lib/setup/order";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Өнөөдөр", "Today") };
}

/*
 * Today, laid out as a cockpit: the greeting with the plan, bot and robot's month beside it; then price, direction and
 * the next release side by side; the 24 hours as one strip; setups, levels and the strategies read underneath.
 * Without a plan the paid figures are never loaded into the page, so they cannot be read from it.
 */
export default async function TodayPage() {
  const v = await getViewer();
  const { t } = v;
  const now = new Date();
  const user = await requireUser();
  const { paid, payOn, contact } = paywallFor(user, now);
  const [snap, upcoming, next, reactions, day, reasoning, paidPlan, bot, setupView] = await Promise.all([
    getTodaySnapshot(SYMBOL, now),
    getEvents(now, new Date(now.getTime() + 24 * 36e5)),
    getNextHighEvent(now),
    getReactions(),
    loadCandles(SYMBOL, "15min", 96),
    paid ? getReasoning(now, v.locale) : Promise.resolve(null),
    latestPaidPlan(user.id),
    botSummary(user.id, now),
    paid ? getSetups(now, v).catch((e) => { console.error("[today] setups failed", e); return null; }) : Promise.resolve(null),
  ]);
  // The robot's own results are the user's data, shown with or without a plan; its live state is not.
  const closed = bot.account ? await botTrades(user.id, bot.account) : [];
  const dashSetups: DashSetup[] | null = setupView
    ? orderSetups(setupView.setups).map((s) => ({ id: s.id, name: s.name, status: s.status, side: s.side, headline: s.headline, entry: s.entry, stop: s.stop, target: s.target }))
    : null;
  const highSoon = upcoming.filter((e) => e.impact === "HIGH").map((e) => ({ time: e.time, title: e.title, type: e.type }));
  const cells = hourCells(paid && snap.hourly ? snap.hourly : lockedHourRows(), ubHour(now), highSoon, v);

  return (
    <div className="reveal space-y-4 sm:space-y-5">
      {!paid && <PlansCard t={t} choose={choosePlanAction} payOn={payOn} contact={contact} compact />}

      <header className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 xl:shrink-0">
          <h1 className="sr-only">{t("Өнөөдөр", "Today")}</h1>
          <p className="font-display text-[26px] leading-tight text-zinc-50 sm:text-[30px]">{user.name ? t(`Сайн уу, ${user.name}`, `Hello, ${user.name}`) : t("Өнөөдөр", "Today")}</p>
          <p className="mt-1 text-sm text-zinc-500 tabular-nums">{weekdayName(zoneWeekday(now, v.timeZone), t)} · {v.date(now)} · {v.time(now)} {v.zone}</p>
        </div>
        <AccountChips v={v} plan={planSummary(user, paidPlan, now)} trades={tradeSummary(closed, bot.positions, now)} bot={paid ? bot : null} />
      </header>

      {/* Phones: price across, then direction and the next release as a pair. Wide screens: the three side by side. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_18.5rem]">
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <PriceCard price={snap.price} closes={day.map((c) => c.close)} levels={paid ? snap.levels : null} v={v} />
        </div>
        <div className="min-w-0">{paid ? <DirectionCard bias={snap.bias} v={v} /> : <DirectionCardLocked v={v} />}</div>
        <div className="min-w-0"><NextReleaseCard next={next} stats={next ? reactions.get(next.type) : undefined} v={v} /></div>
      </div>

      <HourStrip cells={cells} locked={!paid} />

      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-3">
        <SetupsCard setups={paid ? dashSetups ?? [] : null} t={t} />
        {paid ? <KeyLevels levels={snap.levels} price={snap.price?.last} v={v} /> : <KeyLevelsLocked v={v} />}
        {paid ? <ReasoningPanel initial={reasoning} compact narrow /> : <ReasoningLocked narrow />}
      </div>
    </div>
  );
}
