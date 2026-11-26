import Link from "next/link";
import { LotCalculator } from "@/components/LotCalculator";
import { getSetups, type Setup } from "@/lib/setup/build";
import type { SetupHistory } from "@/lib/setup/setups";
import { getNextHighEvent } from "@/lib/events";
import { SetupChart } from "@/components/SetupChart";
import { TelegramCard } from "@/components/TelegramCard";
import { requireUser } from "@/lib/auth";
import { pendingTelegram, telegramConfigured } from "@/lib/telegram";
import { getViewer } from "@/lib/prefs.server";
import { eventTitle } from "@/lib/data/calendarProvider";
import type { T } from "@/lib/i18n";
import { Dir } from "@/components/Timetable";
import { ReasoningPanel, ReasoningLocked } from "@/components/ReasoningPanel";
import { paywallFor } from "@/lib/paywall.server";
import { Masked, PlansCard, UnlockLink } from "@/components/Paywall";
import { choosePlanAction } from "@/lib/actions/payments";
import type { Viewer } from "@/lib/viewer";
import { getReasoning } from "@/lib/reasoningLive";
import { orderSetups, bestRecent } from "@/lib/setup/order";
import { TermHint } from "@/components/TermHint";
import { nowWindow, type NowWindow } from "@/lib/setup/now";
import { relativeText } from "@/lib/relativeTime";
import { dayLabel } from "@/components/NewsList";
import { weekdayName, zoneWeekday } from "@/lib/time";
import { signalHistory } from "@/lib/signalHistory";
import { outcomeTotals } from "@/lib/signalOutcome";
import { BROKER_RECORD } from "@/lib/setup/build";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup — XAU Analytics" };

/** The one line on top: what the system is doing now, what it waits for, and when the next step comes. */
function NowCard({ w, t }: { w: NowWindow; t: T }) {
  const tone = { WAIT: ["border-amber-400/40", "bg-amber-400", t("ХҮЛЭЭЖ БАЙНА", "WAITING")], ENTER: ["border-emerald-400/50", "bg-emerald-400", t("АРИЛЖАА ИДЭВХТЭЙ", "TRADE ON")], DONE: ["border-zinc-700", "bg-zinc-400", t("ДУУССАН", "DONE")], NONE: ["border-zinc-700", "bg-zinc-500", t("ӨНӨӨДӨР АРИЛЖАА АЛГА", "NO TRADE TODAY")], CLOSED: ["border-zinc-700", "bg-zinc-500", t("ЗАХ ХААЛТТАЙ", "MARKET CLOSED")] }[w.state];
  return (
    <section className={`card border ${tone[0]} sm:p-6`} aria-labelledby="now-h">
      <p className="flex items-center gap-2 text-xs font-bold tracking-wider text-zinc-300"><span aria-hidden className={`h-2 w-2 rounded-full ${tone[1]} ${w.state === "ENTER" || w.state === "WAIT" ? "animate-pulse" : ""}`} />{t("ОДОО", "NOW")} · {tone[2]}</p>
      <h2 id="now-h" className="mt-2 text-xl font-bold text-zinc-50 sm:text-2xl">{w.title}{w.liveR !== null && <span className={`ml-3 text-lg tabular-nums ${w.liveR >= 0 ? "text-emerald-400" : "text-red-400"}`}>{w.liveR > 0 ? "+" : ""}{w.liveR.toFixed(2)}R</span>}</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {w.waitingFor && <div><dt className="text-xs text-zinc-500">{t("Яг одоо хүлээж байгаа нь", "Waiting for")}</dt><dd className="mt-0.5 font-medium text-amber-300">{w.waitingFor}</dd></div>}
        {w.next && <div><dt className="text-xs text-zinc-500">{w.next.label}</dt><dd className="mt-0.5 font-medium text-zinc-100 tabular-nums">{w.next.in}</dd></div>}
      </dl>
    </section>
  );
}

/** Setup states as status pills: [word, pill, dot]. The word always carries the meaning. */
const statusOf = (t: T): Record<Setup["status"], [string, string, string]> => ({
  ACTIVE: [t("Идэвхтэй", "Active"), "bg-emerald-500/15 text-emerald-400", "bg-emerald-400"],
  WATCH: [t("Ажиглах", "Watch"), "bg-amber-400/15 text-amber-300", "bg-amber-400"],
  FORMING: [t("Бүрдэж байна", "Forming"), "bg-zinc-800 text-zinc-200", "bg-zinc-400"],
  OFF: [t("Одоо алга", "Not now"), "border border-zinc-800 text-zinc-500", "bg-zinc-600"],
});
const px = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function Record({ title, h, t }: { title: string; h: SetupHistory; t: T }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold text-zinc-200">{title}</h3>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-800/50 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-zinc-400 tabular-nums">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          {h.n} {t("арилжаа", "trades")}
        </span>
      </div>
      {h.winPct === null ? (
        <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/50 p-4">
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t("Дата хангалтгүй (30-аас цөөн арилжаа)", "Not enough data (fewer than 30 trades)")}
          </p>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-xl">
            <div className="flex h-2 overflow-hidden rounded-xl bg-red-500/70" role="img" aria-label={t(`${h.winPct}% ашигтай хаагдсан`, `${h.winPct}% closed in profit`)}>
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${h.winPct}%` }} />
            </div>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <svg className={`h-4 w-4 ${h.winPct >= 60 ? 'text-emerald-400' : 'text-zinc-400'}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-bold text-zinc-100 tabular-nums">{h.winPct}%</span>
              <span className="text-zinc-400">{t("ашигтай", "profitable")}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className={`h-4 w-4 ${h.avgR! > 0 ? 'text-emerald-400' : h.avgR! < 0 ? 'text-red-400' : 'text-zinc-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={h.avgR! > 0 ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"} />
              </svg>
              <span className={`font-semibold tabular-nums ${h.avgR! > 0 ? "text-emerald-400" : h.avgR! < 0 ? "text-red-400" : "text-zinc-300"}`}>
                {h.avgR! > 0 ? "+" : ""}{h.avgR!.toFixed(2)}R
              </span>
              <span className="text-zinc-400">{t("дундаж", "avg")}</span>
              <TermHint id="r" />
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="text-zinc-400">PF</span>
              <TermHint id="profit-factor" />
              <span className="font-semibold text-zinc-100 tabular-nums">{h.profitFactor === null ? "—" : h.profitFactor.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Entry, stop and target as stations on one price line, highest at the top, like the key-levels ladder on Today. */
function Ladder({ s, t }: { s: Setup; t: T }) {
  if (s.entry === null) return null;
  const entry = s.entry;
  type Kind = "entry" | "stop" | "target";
  const all: [string, number | null, Kind][] = [[t("Орох", "Entry"), s.entry, "entry"], ["Stop", s.stop, "stop"], ["Target", s.target, "target"]];
  const rows = all.filter((r): r is [string, number, Kind] => r[1] !== null).sort((a, b) => b[1] - a[1]);
  const rr = s.stop !== null && s.target !== null && entry !== s.stop ? Math.abs(s.target - entry) / Math.abs(entry - s.stop) : null;
  const station = { entry: "border-zinc-50 bg-amber-400", stop: "border-red-400 bg-zinc-900", target: "border-emerald-400 bg-zinc-900" };
  return (
    <div className="mt-4 max-w-sm">
      <div className="relative">
        <span aria-hidden className="absolute top-3.5 bottom-3.5 left-[5px] w-[3px] rounded-full bg-zinc-800" />
        <dl>
          {rows.map(([k, val, kind]) => (
            <div key={kind} className="relative flex items-center gap-3 py-1.5 text-sm">
              <span aria-hidden className={`relative z-10 h-[13px] w-[13px] shrink-0 rounded-full border-[3px] ${station[kind]}`} />
              <dt className={kind === "entry" ? "font-semibold text-amber-300" : "text-zinc-400"}>{k}</dt>
              <dd className="ml-auto flex items-baseline gap-3">
                <span className="font-semibold text-zinc-100 tabular-nums">{px(val)}</span>
                <span className={`w-16 text-right text-xs tabular-nums ${kind === "stop" ? "text-red-400" : kind === "target" ? "text-emerald-400" : "text-zinc-500"}`}>
                  {kind === "entry" ? "" : `${kind === "target" ? "+" : "−"}$${Math.abs(val - entry).toFixed(2)}`}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <dl className="mt-1 flex items-baseline justify-between gap-3 border-t border-zinc-800 pt-2 text-sm">
        <dt className="flex items-center gap-1.5 text-zinc-400">R:R <TermHint id="rr" /></dt>
        <dd className="font-semibold text-zinc-100 tabular-nums">{rr === null ? "—" : `1 : ${rr.toFixed(1)}`}</dd>
      </dl>
    </div>
  );
}

/**
 * A rule's card for someone without a plan: its name, its chart of candles and the full rule stay; whether it is
 * live, the side, entry, stop, target, the checks and its record are masked (and never sent to the page).
 */
function SetupLocked({ s, candles, v }: { s: Setup; candles: { time: string; open: number; high: number; low: number; close: number }[]; v: Viewer }) {
  const { t } = v;
  const rows: [string, string][] = [[t("Орох", "Entry"), "entry"], ["Stop", "stop"], ["Target", "target"], ["R:R", "rr"]];
  return (
    <section className="card">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="min-w-0 space-y-5">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-zinc-100">{s.name}</h2>
              <span className="rounded-xl border border-zinc-800 px-3 py-1.5 text-xs"><Masked t={t} /></span>
            </div>
            <p className="mt-4 text-2xl font-bold"><Masked t={t} /></p>
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-zinc-400">{t("Одоо орох боломж бүрдсэн эсэх, чиглэл, орох үнэ, stop, target багцтай хэрэглэгчдэд харагдана.", "Whether an entry is on now, its side, entry, stop and target show with a plan.")}</p>
          </div>
          <dl className="max-w-sm rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5 text-sm">
            {rows.map(([k, id]) => (
              <div key={id} className="flex items-baseline justify-between gap-3 py-1.5"><dt className="text-zinc-400">{k}</dt><dd><Masked t={t} /></dd></div>
            ))}
          </dl>
          <UnlockLink t={t} />
        </div>
        <div className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-4">
            <SetupChart candles={candles} side={null} entry={null} stop={null} target={null} band={null} v={v} />
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-5 border-t border-zinc-800/50 pt-6 sm:grid-cols-2">
        {[t("Түүхэн үр дүн, бүх хугацаа", "Historical record, all time"), t("Сүүлийн 12 сар", "Last 12 months")].map((title) => (
          <div key={title} className="rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5">
            <h3 className="font-semibold text-zinc-200">{title}</h3>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-400"><span><Masked t={t} /> {t("ашигтай", "profitable")}</span><span><Masked t={t} /> {t("дундаж", "avg")}</span></p>
          </div>
        ))}
      </div>
      <details className="mt-4">
        <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-xl px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200">{t("Дүрмийг бүтнээр нь унших", "Read the full rule")}</summary>
        <p className="mt-3 max-w-prose rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5 leading-relaxed text-zinc-300">{s.rule}</p>
      </details>
    </section>
  );
}

export default async function SetupPage() {
  const v = await getViewer();
  const { t } = v;
  const STATUS = statusOf(t);
  const now = new Date();
  const user = await requireUser();
  const { paid, payOn, contact } = paywallFor(user, now);
  const [view, next, reasoning, live] = await Promise.all([getSetups(now, v), getNextHighEvent(now), paid ? getReasoning(now, v.locale) : Promise.resolve(null), paid ? signalHistory(now, 40) : Promise.resolve([])]);
  const liveTotals = outcomeTotals(live.map((r) => r.outcome));
  const candles = view.candles.map((c) => ({ ...c, time: c.time.toISOString() }));

  // Most actionable first (active, watch, forming, off); the rules otherwise keep their fixed order.
  const sortedSetups = orderSetups(view.setups);
  const best = bestRecent(view.setups);
  const stale = view.setups.some((s) => s.stale);

  return (
    <div className="reveal space-y-5 sm:space-y-7">
      <div className="card sm:p-6">
        <div>
          <div className="flex items-center gap-3">
            <svg className="h-7 w-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h1 className="page-title">Setup</h1>
          </div>
          <p className="page-lede mt-3">{t("Азийн хүрээний breakout: одоо юу хүлээж байна, хаанаас орох, stop, target, түүхэн болон бодит үр дүн.", "Asian range breakout: what it waits for now, where to enter, the stop and target, and its past and live results.")}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className={`rounded-xl border px-4 py-2 ${stale ? "border-red-500/40 bg-red-500/10" : "border-zinc-800/50 bg-zinc-900/30"}`}>
              <p className={`flex items-center gap-2 text-xs tabular-nums ${stale ? "font-semibold text-red-300" : "text-zinc-400"}`}>
                <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {view.lastCandleAt ? t(`Сүүлийн лаа ${v.dateTime(view.lastCandleAt)} (${v.zone})`, `Last candle ${v.dateTime(view.lastCandleAt)} (${v.zone})`) : t("Лааны дата ачаалж байна", "Loading candle data")}
                {stale && <span>· {t("үнийн дата хоцорч байна", "price data is behind")}</span>}
              </p>
            </div>
            {next && (
              <div className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2">
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" aria-hidden />
                <span className="text-xs font-semibold text-amber-300">
                  {t("Дараагийн чухал мэдээ", "Next important release")}: {eventTitle(next, t)} · {dayLabel(v.date(next.time), t)}, {weekdayName(zoneWeekday(next.time, v.timeZone), t)} {v.time(next.time)} ({v.zone}) · {relativeText(next.time.getTime() - now.getTime(), t)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {!paid && <PlansCard t={t} choose={choosePlanAction} payOn={payOn} contact={contact} compact />}

      {paid && sortedSetups[0] && <NowCard w={nowWindow(sortedSetups[0], now, view.candles.at(-1)?.close ?? null, v)} t={t} />}

      {sortedSetups.map((s) => {
        if (!paid) return <SetupLocked key={s.id} s={s} candles={candles} v={v} />;
        const done = s.result !== undefined;
        const [label, tone, dot] = done
          ? [t("Дууссан", "Finished"), s.result! > 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400", s.result! > 0 ? "bg-emerald-400" : "bg-red-400"]
          : STATUS[s.status];
        const live = s.status !== "OFF" && s.side !== null;
        const headTone = done ? (s.result! > 0 ? "text-emerald-400" : "text-red-400") : !live ? "text-zinc-200" : s.side === "BUY" ? "text-emerald-400" : "text-red-400";
        const isBest = best?.id === s.id;

        return (
          <section key={s.id} className="card">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-6">
                {/* Phones read top to bottom: what it is, the chart, then the levels and checks. Wide screens put the chart on the right. */}
                <div className="min-w-0 lg:col-start-1 lg:row-start-1">
                  {/* In the normal flow, above the title, so it can never cover it on a narrow screen. */}
                  {isBest && best && (
                    <p className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                      <svg aria-hidden className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.07 3.29a1 1 0 0 0 .95.69h3.46c.97 0 1.37 1.24.59 1.81l-2.8 2.03a1 1 0 0 0-.36 1.12l1.07 3.3c.3.91-.76 1.68-1.54 1.11l-2.8-2.03a1 1 0 0 0-1.18 0l-2.8 2.03c-.78.57-1.84-.2-1.54-1.12l1.07-3.29a1 1 0 0 0-.36-1.12L2.98 8.72c-.78-.57-.38-1.81.59-1.81h3.46a1 1 0 0 0 .95-.69l1.07-3.3Z" /></svg>
                      {t(`Сүүлийн 12 сард арилжаа тутмын дундаж үр дүн хамгийн өндөр (+${best.avgR.toFixed(2)}R)`, `Best average result per trade over the last 12 months (+${best.avgR.toFixed(2)}R)`)}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-zinc-100">{s.name}</h2>
                    <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold ${tone}`}>
                      <span aria-hidden className={`h-2 w-2 rounded-full ${dot} ${s.status === 'ACTIVE' ? 'animate-pulse' : ''}`} />
                      {label}
                    </span>
                  </div>

                  <div className={`mt-4 flex items-baseline gap-3 text-2xl leading-tight font-bold tracking-tight ${headTone}`}>
                    {(live || done) && s.side && <Dir d={s.side === "BUY" ? 1 : -1} className="text-3xl" />}
                    <span>{s.headline}</span>
                  </div>

                  <p className="mt-3 max-w-prose text-sm leading-relaxed text-zinc-400">{s.detail}</p>
                  {done && s.entry !== null && s.stop !== null && (
                    <p className={`mt-3 text-sm font-semibold tabular-nums ${s.result! > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {t("Үр дүн", "Result")}: {s.result! > 0 ? "+" : ""}{s.result!.toFixed(2)}R · 0.01 lot {s.result! > 0 ? "+" : "−"}${Math.abs(s.result! * Math.abs(s.entry - s.stop)).toFixed(2)}
                    </p>
                  )}
                </div>

              <div className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">
                <div className="overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-3 sm:p-4">
                  <SetupChart candles={candles} side={s.side} entry={s.entry} stop={s.stop} target={s.target} band={s.band} v={v} />
                </div>
              </div>

              <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-2">
                {s.entry !== null && (
                  <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5">
                    <Ladder s={s} t={t} />
                  </div>
                )}

                {s.checks.length > 0 && (
                  <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
                      <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      {t("Нөхцөл шалгалт", "Conditions")}
                    </h3>
                    <div className="relative">
                      {s.checks.length > 1 && <span aria-hidden className="absolute top-3.5 bottom-3.5 left-[6px] w-[3px] rounded-full bg-zinc-800" />}
                      <ul className="space-y-1 text-sm">
                        {s.checks.map((c) => (
                          <li key={c.label} className={`relative flex items-start gap-3 rounded-lg py-2 px-1 ${c.ok ? "text-zinc-200" : "text-zinc-500"}`}>
                            <span aria-hidden className={`relative z-10 mt-[3.5px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-[3px] ${
                              c.ok
                                ? "border-emerald-400 bg-emerald-400"
                                : "border-zinc-600 bg-zinc-900"
                            }`}>
                              {c.ok && <svg className="h-2.5 w-2.5 text-zinc-900" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                            </span>
                            <span className="flex-1">{c.label}<span className="sr-only">{c.ok ? t(" (биелсэн)", " (met)") : t(" (биелээгүй)", " (not met)")}</span></span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-4 border-t border-zinc-800/50 pt-6 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5">
                <Record t={t} title={t("Сүүлийн 12 сар", "Last 12 months")} h={s.recent} />
              </div>
              <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5">
                <Record t={t} title={view.historyFrom ? t(`${v.date(view.historyFrom).slice(0, 7)} → өнөөдөр`, `${v.date(view.historyFrom).slice(0, 7)} → today`) : t("Хадгалсан бүх дата", "All stored data")} h={s.history} />
              </div>
              <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5">
                <Record t={t} title={t(`Брокерын 7 жил (${BROKER_RECORD.from} →)`, `Broker data, 7 years (${BROKER_RECORD.from} →)`)} h={BROKER_RECORD} />
                <p className="mt-2 text-xs text-zinc-500">{t(`MT5 Strategy Tester, ${BROKER_RECORD.source}, ${BROKER_RECORD.checkedOn}-нд шалгасан.`, `MT5 Strategy Tester, ${BROKER_RECORD.source}, checked ${BROKER_RECORD.checkedOn}.`)}</p>
              </div>
            </div>

            <details className="group/details mt-4">
              <summary className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200">
                <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 transition-transform duration-300 group-open/details:rotate-180">
                  <path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t("Дүрмийг бүтнээр нь унших", "Read the full rule")}
              </summary>
              <div className="mt-3 rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5">
                <p className="max-w-prose leading-relaxed text-zinc-300">{s.rule}</p>
                <p className="mt-3 max-w-prose text-sm leading-relaxed text-zinc-400">{t("MT5 робот: Бот хуудсанд «Азийн breakout» хэрэгслийг сонговол яг энэ дүрмээр, өдөрт нэг удаа арилжаална.", "MT5 robot: choose the “Asian breakout” tool on the Bot page and it trades exactly this rule, once a day.")}</p>
              </div>
            </details>
          </section>
        );
      })}

      <section className="card" aria-labelledby="live-h">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="live-h" className="card-title">{t("Бодит дохионы үр дүн", "Live signal results")}</h2>
          <Link href="/bot/history" className="text-sm font-medium text-amber-300 hover:text-amber-200">{t("Бүх түүх →", "Full history →")}</Link>
        </div>
        {!paid ? <p className="mt-2 text-sm text-zinc-400">{t("Бодит дохионууд, тэдгээрийн үр дүн багцтай хэрэглэгчдэд.", "Live signals and how they ended come with a plan.")}</p>
          : live.length === 0 ? <p className="mt-2 text-sm text-zinc-400">{t("Одоогоор дохио гараагүй. Дохио бүр, TP/SL үр дүнтэйгээ энд бүртгэгдэнэ.", "No signals yet. Each one appears here with how it ended.")}</p> : (
          <>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm tabular-nums">
              <div><dt className="text-xs text-zinc-500">{t("Хаагдсан", "Closed")}</dt><dd className="mt-0.5 text-lg font-bold text-zinc-100">{liveTotals.closed}{liveTotals.open ? <span className="ml-1 text-xs font-normal text-zinc-500">+{liveTotals.open} {t("нээлттэй", "open")}</span> : null}</dd></div>
              <div><dt className="text-xs text-zinc-500">{t("Ашигтай", "Profitable")}</dt><dd className="mt-0.5 text-lg font-bold text-zinc-100">{liveTotals.winPct === null ? "—" : `${liveTotals.winPct}%`}</dd></div>
              <div><dt className="text-xs text-zinc-500">{t("Нийт", "Total")}</dt><dd className={`mt-0.5 text-lg font-bold ${liveTotals.totalR > 0 ? "text-emerald-400" : liveTotals.totalR < 0 ? "text-red-400" : "text-zinc-100"}`}>{liveTotals.totalR > 0 ? "+" : ""}{liveTotals.totalR.toFixed(2)}R</dd></div>
            </dl>
            <ul className="mt-3 divide-y divide-zinc-800/70 text-sm">
              {live.slice(0, 5).map((r) => {
                const o = r.outcome;
                const tone = o.kind === "OPEN" ? "text-amber-300" : (o.r ?? 0) > 0 ? "text-emerald-400" : "text-red-400";
                const word = o.kind === "WIN" ? "TP" : o.kind === "LOSS" ? "SL" : o.kind === "TIME" ? t("Цагаар", "On time") : t("Нээлттэй", "Open");
                return (
                  <li key={r.id} className="flex items-center gap-3 py-2 tabular-nums">
                    <span className="w-24 shrink-0 text-zinc-400">{v.dateTime(r.createdAt).slice(5)}</span>
                    <span className={`w-12 shrink-0 font-semibold ${r.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{r.side}</span>
                    <span className="hidden text-zinc-300 sm:inline">{px(r.entry)}</span>
                    <span className={`ml-auto font-bold ${tone}`}>{word}{o.r !== null ? ` ${o.r > 0 ? "+" : ""}${o.r.toFixed(2)}R` : ""}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <TelegramCard configured={telegramConfigured()} linked={!!user.telegramChatId} isAdmin={user.role === "ADMIN"} pending={user.telegramChatId ? null : pendingTelegram(user, new Date())} />

      {(() => {
        // Prefilled from the setup that is live now (paid users only: its levels are what a plan pays for).
        const liveSetup = paid ? sortedSetups.find((s) => s.status !== "OFF" && s.entry !== null && s.stop !== null) : undefined;
        return <LotCalculator stop={liveSetup ? Math.abs(liveSetup.entry! - liveSetup.stop!) : null} target={liveSetup && liveSetup.target !== null ? Math.abs(liveSetup.target - liveSetup.entry!) : null} source={liveSetup?.name} />;
      })()}

      {paid ? <ReasoningPanel initial={reasoning} /> : <ReasoningLocked />}

      <p className="max-w-prose text-xs leading-relaxed text-zinc-500">
        {t(`Түүхэн үр дүн нь хадгалагдсан лаанууд дээр (${view.historyFrom ? `${v.date(view.historyFrom)}-оос` : "дата ирмэгц"}) дүрмийг дахин тоглуулж гаргасан тоо: spread $0.30, лаан доторх stop-ыг target-аас түрүүлж тооцсон. R нь эрсдэлийн нэгж (stop хүртэлх зай). Ирээдүйн үр дүнг батлахгүй, санхүүгийн зөвлөгөө биш.`,
          `The historical record comes from replaying the rule over the stored candles (${view.historyFrom ? `from ${v.date(view.historyFrom)}` : "once data arrives"}): a $0.30 spread, and a stop inside a candle counted before the target. R is the unit of risk (the distance to the stop). It does not guarantee future results and is not financial advice.`)}
      </p>
    </div>
  );
}
