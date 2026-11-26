import Link from "next/link";
import { LotCalculator } from "@/components/LotCalculator";
import { getSetups, BROKER_RECORD, type Setup } from "@/lib/setup/build";
import { getNextHighEvent } from "@/lib/events";
import { TelegramCard } from "@/components/TelegramCard";
import { requireUser } from "@/lib/auth";
import { pendingTelegram, telegramConfigured } from "@/lib/telegram";
import { getViewer } from "@/lib/prefs.server";
import { eventTitle } from "@/lib/data/calendarProvider";
import { ReasoningPanel, ReasoningLocked } from "@/components/ReasoningPanel";
import { paywallFor } from "@/lib/paywall.server";
import { PlansCard } from "@/components/Paywall";
import { choosePlanAction } from "@/lib/actions/payments";
import { getReasoning } from "@/lib/reasoningLive";
import { orderSetups, bestRecent } from "@/lib/setup/order";
import { nowWindow } from "@/lib/setup/now";
import { relativeText } from "@/lib/relativeTime";
import { weekdayName, zoneWeekday } from "@/lib/time";
import { signalHistory } from "@/lib/signalHistory";
import { SetupTabs } from "@/components/SetupTabs";
import { NowCard, SetupTab, SetupPanel, SetupLockedPanel, LiveResults } from "@/components/SetupParts";
import { Icon } from "@/components/TodayIcons";
import { SIGNAL_WINDOW, recordSentence, recordTitle, stamp, type BrokerRecord } from "@/lib/siteCopy";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = (await getViewer()).t;
  return { title: t("Setup дохио", "Setup") };
}

/*
 * Setup: the "now" card, the three rules as a list beside one panel for the chosen rule (its chart, levels, checks,
 * record and full text), then the live results, the lot calculator and Telegram side by side, and the strategies read.
 */
export default async function SetupPage() {
  const v = await getViewer();
  const { t } = v;
  const now = new Date();
  const user = await requireUser();
  const { paid, payOn, contact } = paywallFor(user, now);
  const [view, next, reasoning, live] = await Promise.all([getSetups(now, v), getNextHighEvent(now), paid ? getReasoning(now, v.locale) : Promise.resolve(null), paid ? signalHistory(now, SIGNAL_WINDOW) : Promise.resolve([])]);
  const candles = view.candles.map((c) => ({ ...c, time: c.time.toISOString() }));

  // Most actionable first (active, watch, forming, off); the rules otherwise keep their fixed order.
  const sorted = orderSetups(view.setups);
  const best = bestRecent(view.setups);
  const stale = view.setups.some((s) => s.stale);
  const records = (s: Setup) => [
    { title: t("Сүүлийн 12 сар", "Last 12 months"), h: s.recent },
    { title: view.historyFrom ? t(`${v.date(view.historyFrom).slice(0, 7)} → өнөөдөр`, `${v.date(view.historyFrom).slice(0, 7)} → today`) : t("Хадгалсан бүх дата", "All stored data"), h: s.history },
    ...(s.id === "asian-breakout" ? [{ title: recordTitle(BROKER_RECORD as BrokerRecord, t), h: BROKER_RECORD, note: recordSentence(BROKER_RECORD as BrokerRecord, t) }] : []),
  ];
  // Prefilled from the setup that is live now (paid users only: its levels are what a plan pays for).
  const liveSetup = paid ? sorted.find((s) => s.status !== "OFF" && s.entry !== null && s.stop !== null) : undefined;
  const bestSetup = best ? sorted.find((s) => s.id === best.id) : undefined;

  return (
    <div className="reveal space-y-4 sm:space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] leading-tight text-zinc-50 sm:text-[32px]">Setup</h1>
          <p className="mt-1 max-w-prose text-sm text-zinc-500">{t("Ази, Нью-Йоркийн нээлтийн хүрээний breakout · 3 дүрэм", "Asian and New York opening-range breakouts · 3 rules")}</p>
        </div>
        <div className="relative -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:justify-end lg:overflow-visible lg:pb-0">
          <div className={`glass-tile flex min-w-max shrink-0 items-center gap-2.5 px-3.5 py-2 ${stale ? "border-red-500/40" : ""}`}>
            <Icon name="clock" className={`h-[18px] w-[18px] ${stale ? "text-red-400" : "text-zinc-400"}`} />
            <span>
              <span className="block text-xs text-zinc-500">{t("Сүүлийн лаа", "Last candle")}</span>
              <span className={`block text-sm font-semibold whitespace-nowrap tabular-nums ${stale ? "text-red-300" : "text-zinc-200"}`}>
                {view.lastCandleAt ? `${stamp(v, view.lastCandleAt, now)} ${v.zone}` : t("ачаалж байна", "loading")}{stale && ` · ${t("хоцорч байна", "behind")}`}
              </span>
            </span>
          </div>
          {next && (
            <Link href="/news" className="glass-tile flex min-w-max shrink-0 items-center gap-2.5 px-3.5 py-2 hover:border-[var(--hairline-gold)]">
              <Icon name="clock" className="h-[18px] w-[18px] text-amber-300" />
              <span>
                <span className="block text-xs text-zinc-500">{t("Дараагийн чухал мэдээ", "Next key release")} · {weekdayName(zoneWeekday(next.time, v.timeZone), t)} {v.time(next.time)}</span>
                <span className="block text-sm font-semibold whitespace-nowrap text-amber-300">{eventTitle(next, t)} · {relativeText(next.time.getTime() - now.getTime(), t)}</span>
              </span>
            </Link>
          )}
        </div>
      </header>

      {!paid && <PlansCard t={t} choose={choosePlanAction} payOn={payOn} contact={contact} compact />}

      {paid && sorted[0] && <NowCard w={nowWindow(sorted[0], now, view.candles.at(-1)?.close ?? null, v)} t={t} />}

      <SetupTabs
        label={t("Setup сонгох", "Choose a setup")}
        ids={sorted.map((s) => s.id)}
        tabs={sorted.map((s) => <SetupTab key={s.id} s={s} t={t} paid={paid} />)}
        panels={sorted.map((s) => paid
          ? <SetupPanel key={s.id} s={s} candles={candles} v={v} best={best?.id === s.id ? best : null} records={records(s)} />
          : <SetupLockedPanel key={s.id} s={s} candles={candles} v={v} />)}
        aside={paid && best && bestSetup ? (
          <p className="flex items-start gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-3 text-[13px] leading-snug text-amber-300 max-lg:hidden">
            <Icon name="bolt" className="mt-0.5 h-4 w-4 shrink-0" />
            {t(`Сүүлийн 12 сард арилжаа тутмын дундаж үр дүн хамгийн өндөр нь: ${bestSetup.name} (+${best.avgR.toFixed(2)}R)`, `Best average result per trade over the last 12 months: ${bestSetup.name} (+${best.avgR.toFixed(2)}R)`)}
          </p>
        ) : undefined}
      />

      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2">
        <LiveResults live={live} paid={paid} v={v} now={now} />
        <LotCalculator stop={liveSetup ? Math.abs(liveSetup.entry! - liveSetup.stop!) : null} target={liveSetup && liveSetup.target !== null ? Math.abs(liveSetup.target - liveSetup.entry!) : null} source={liveSetup?.name} />
        <div className="lg:col-span-2"><TelegramCard configured={telegramConfigured()} linked={!!user.telegramChatId} isAdmin={user.role === "ADMIN"} paid={paid} pending={user.telegramChatId ? null : pendingTelegram(user, new Date())} /></div>
      </div>

      {paid ? <ReasoningPanel initial={reasoning} /> : <ReasoningLocked />}

      <p className="max-w-prose text-xs leading-relaxed text-zinc-500">
        {t(`Түүхэн үр дүн нь хадгалагдсан лаанууд дээр (${view.historyFrom ? `${v.date(view.historyFrom)}-оос` : "дата ирмэгц"}) дүрмийг дахин тоглуулж гаргасан тоо: spread $0.30, лаан доторх stop-ыг target-аас түрүүлж тооцсон. R нь эрсдэлийн нэгж (stop хүртэлх зай). Ирээдүйн үр дүнг батлахгүй, санхүүгийн зөвлөгөө биш.`,
          `The historical record comes from replaying the rule over the stored candles (${view.historyFrom ? `from ${v.date(view.historyFrom)}` : "once data arrives"}): a $0.30 spread, and a stop inside a candle counted before the target. R is the unit of risk (the distance to the stop). It does not guarantee future results and is not financial advice.`)}
      </p>
    </div>
  );
}
