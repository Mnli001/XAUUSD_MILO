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
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { PriceAlertsCard, PriceAlertsLocked, type AlertRow } from "@/components/PriceAlertsCard";
import { MAX_ACTIVE_ALERTS, listPriceAlerts } from "@/lib/priceAlerts";
import { pushDeviceCount } from "@/lib/push";
import { MAX_CONDITION_ALERTS, conditionLabel, listConditionAlerts } from "@/lib/conditionAlerts";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Өнөөдөр", "Today") };
}

/** A secondary block, folded by default: one slim line with its name and why you might open it; the card underneath. */
function Fold({ id, title, hint, children }: { id: string; title: string; hint: string; children: ReactNode }) {
  return (
    <details id={id} className="group scroll-mt-24">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-2xl border px-4 py-2.5 transition-colors hover:bg-zinc-500/10 motion-reduce:transition-none [&::-webkit-details-marker]:hidden" style={{ borderColor: "var(--hairline)", background: "var(--glass-inset)" }}>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-zinc-100">{title}</span>
          <span className="block text-xs text-zinc-500">{hint}</span>
        </span>
        <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-zinc-500 transition-transform group-open:rotate-180 motion-reduce:transition-none"><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/*
 * Today, in order of importance: the plan strip (without a plan); the greeting with the plan, bot and robot chips; price,
 * the day's direction and the next release; today's signals; the 24 hours. Then three folded blocks for when you want
 * more: key levels, the methods' vote (which may differ from the day's direction), alerts.
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
  const [alertRows, devices, condRows] = paid ? await Promise.all([listPriceAlerts(user.id), pushDeviceCount(user.id), listConditionAlerts(user.id)]) : [[], 0, []];
  const conditions = { rows: condRows.map((c) => ({ id: c.id, label: conditionLabel(c, v), lastFired: c.lastFiredAt ? v.dateTime(c.lastFiredAt) : null })), max: MAX_CONDITION_ALERTS };
  const alerts: AlertRow[] = alertRows.map((a) => ({ id: a.id, level: a.level, direction: a.direction === "above" ? "above" : "below", set: v.dateTime(a.createdAt), fired: a.triggeredAt ? v.dateTime(a.triggeredAt) : null, firedPrice: a.triggeredPrice }));
  const highSoon = upcoming.filter((e) => e.impact === "HIGH").map((e) => ({ time: e.time, title: e.title, type: e.type }));
  const cells = hourCells(paid && snap.hourly ? snap.hourly : lockedHourRows(), ubHour(now), highSoon, v);

  return (
    <div className="reveal space-y-4 sm:space-y-5">
      {!paid && <PlansCard t={t} choose={choosePlanAction} payOn={payOn} contact={contact} compact />}

      {/* Greeting on the left, the language button in the top-right corner; the chips sit under the greeting on
          narrower screens and between the two on the widest, where every language's greeting still has room. */}
      <header className="relative z-30 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 2xl:grid-cols-[minmax(0,1fr)_auto_auto] 2xl:items-center">
        <div className="min-w-0">
          <h1 className="sr-only">{t("Өнөөдөр", "Today")}</h1>
          <p className="font-display text-[26px] leading-tight text-zinc-50 sm:text-[30px]">{user.name ? t(`Сайн уу, ${user.name}`, `Hello, ${user.name}`) : t("Өнөөдөр", "Today")}</p>
          <p className="mt-1 text-sm text-zinc-500 tabular-nums">{weekdayName(zoneWeekday(now, v.timeZone), t)} · {v.date(now)} · {v.time(now)} {v.zone}</p>
        </div>
        <div className="col-start-2 row-start-1 2xl:col-start-3"><LanguageSwitch locale={v.locale} iconOnly /></div>
        <div className="col-span-2 min-w-0 2xl:col-span-1 2xl:col-start-2 2xl:row-start-1">
          <AccountChips v={v} plan={planSummary(user, paidPlan, now)} trades={tradeSummary(closed, bot.positions, now)} bot={paid ? bot : null} />
        </div>
      </header>

      {/* Phones: price across, then direction and the next release as a pair. Wide screens: the three side by side. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_18.5rem]">
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <PriceCard price={snap.price} closes={day.map((c) => c.close)} levels={paid ? snap.levels : null} v={v} />
        </div>
        <div className="min-w-0">{paid ? <DirectionCard bias={snap.bias} v={v} /> : <DirectionCardLocked v={v} />}</div>
        <div className="min-w-0"><NextReleaseCard next={next} stats={next ? reactions.get(next.type) : undefined} v={v} /></div>
      </div>

      <SetupsCard setups={paid ? dashSetups ?? [] : null} t={t} />

      <HourStrip cells={cells} locked={!paid} />

      <div className="space-y-3">
        <Fold id="levels" title={t("Гол түвшин", "Key levels")} hint={t("Өчигдрийн оргил, ёроол, pivot, өдрийн ATR", "Yesterday's high and low, pivots, daily ATR")}>
          {paid ? <KeyLevels levels={snap.levels} price={snap.price?.last} v={v} /> : <KeyLevelsLocked v={v} />}
        </Fold>
        <Fold id="vote" title={t("Аргуудын санал (дэмжлэг)", "Methods' vote (support)")} hint={t("Өдрийн чиглэлээс зөрж болно: богино хугацааны уншилт, дохио биш", "May differ from the day's direction: a short-term read, not a signal")}>
          {paid ? <ReasoningPanel initial={reasoning} compact /> : <ReasoningLocked />}
        </Fold>
        <Fold id="alerts" title={t("Үнийн сэрэмжлүүлэг", "Price alerts")} hint={t("Үнэ эсвэл нөхцөл биелэхэд Telegram, утсанд мэдэгдэнэ", "Telegram and phone notice when a price or condition is met")}>
          {paid
            ? <PriceAlertsCard alerts={alerts} price={snap.price?.last ?? null} channels={{ telegram: !!user.telegramChatId, push: devices > 0 }} max={MAX_ACTIVE_ALERTS} conditions={conditions} />
            : <PriceAlertsLocked />}
        </Fold>
      </div>
    </div>
  );
}
