import { getSetups, type Setup } from "@/lib/setup/build";
import type { SetupHistory } from "@/lib/setup/setups";
import { getNextHighEvent } from "@/lib/events";
import { SetupChart } from "@/components/SetupChart";
import { TelegramCard } from "@/components/TelegramCard";
import { requireUser } from "@/lib/auth";
import { listSignals } from "@/lib/signals";
import { pendingTelegram, telegramConfigured } from "@/lib/telegram";
import { getViewer } from "@/lib/prefs.server";
import { eventTitle } from "@/lib/data/calendarProvider";
import type { T } from "@/lib/i18n";
import { Dir } from "@/components/Timetable";
import { ReasoningPanel } from "@/components/ReasoningPanel";
import { getReasoning } from "@/lib/reasoningLive";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup — XAU Analytics" };

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
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800/50 px-2.5 py-1 text-xs font-medium text-zinc-400 tabular-nums">
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
            <div className="flex h-2 overflow-hidden rounded-xl bg-red-500/70 shadow-inner" role="img" aria-label={t(`${h.winPct}% ашигтай хаагдсан`, `${h.winPct}% closed in profit`)}>
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-lg transition-all duration-700" style={{ width: `${h.winPct}%` }} />
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
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="text-zinc-400">PF</span>
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
        <dt className="text-zinc-400">R:R</dt>
        <dd className="font-semibold text-zinc-100 tabular-nums">{rr === null ? "—" : `1 : ${rr.toFixed(1)}`}</dd>
      </dl>
    </div>
  );
}

const chevron = <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 transition-transform group-open:rotate-180"><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export default async function SetupPage() {
  const v = await getViewer();
  const { t } = v;
  const STATUS = statusOf(t);
  const now = new Date();
  const user = await requireUser();
  const [view, next, signals, reasoning] = await Promise.all([getSetups(now, v), getNextHighEvent(now), listSignals(15), getReasoning(now, v.locale)]);
  const candles = view.candles.map((c) => ({ ...c, time: c.time.toISOString() }));
  
  // Sort setups: FORMING first (most important), then ACTIVE, WATCH, OFF. Within same status, sort by win rate
  const sortedSetups = [...view.setups].sort((a, b) => {
    // Priority 1: Status - FORMING is most important as it's currently developing
    const statusPriority = { FORMING: 5, ACTIVE: 4, WATCH: 3, OFF: 1 };
    const statusDiff = (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0);
    if (statusDiff !== 0) return statusDiff;
    
    // Priority 2: Win rate from recent history (last 12 months)
    const aWin = a.recent.winPct ?? 0;
    const bWin = b.recent.winPct ?? 0;
    return bWin - aWin;
  });
  
  return (
    <div className="reveal space-y-5 sm:space-y-7">
      <div className="card group relative overflow-hidden sm:p-8">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-400/5 blur-3xl transition-all duration-700 group-hover:scale-150 group-hover:bg-amber-400/10" aria-hidden />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <svg className="h-7 w-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h1 className="page-title">Setup</h1>
          </div>
          <p className="page-lede mt-4">{t("Хоёр тогтсон дүрмийг одоогийн зах дээр уншиж, орох боломж бүрдэж байгаа эсэх, хаанаас орж, хаана stop, target тавихыг зургаар харуулна. Дүрэм бүрийн хажууд түүхэнд яг энэ дүрэм ямар үр дүн өгснийг тавьсан.", "Two fixed rules are read against the current market: whether an entry is forming, where to enter, and where the stop and target go, drawn on a chart. Next to each rule is how exactly that rule has done in the past.")}</p>
          
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 px-4 py-2 backdrop-blur-sm">
              <p className="flex items-center gap-2 text-xs text-zinc-400 tabular-nums">
                <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {view.lastCandleAt ? t(`Сүүлийн лаа ${v.dateTime(view.lastCandleAt)} (${v.zone})`, `Last candle ${v.dateTime(view.lastCandleAt)} (${v.zone})`) : t("Лааны дата ачаалж байна", "Loading candle data")}
              </p>
            </div>
            {next && (
              <div className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 backdrop-blur-sm">
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" aria-hidden />
                <span className="text-xs font-semibold text-amber-300">
                  {t("Дараагийн чухал мэдээ", "Next release")} {v.time(next.time)}: {eventTitle(next, t)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <ReasoningPanel initial={reasoning} />

      {sortedSetups.map((s, index) => {
        const [label, tone, dot] = STATUS[s.status];
        const live = s.status !== "OFF" && s.side !== null;
        const isTopPerformer = index === 0 && s.recent.winPct && s.recent.winPct >= 60;
        const isForming = s.status === "FORMING";
        
        return (
          <section key={s.id} className={`card group relative overflow-hidden transition-all duration-500 hover:shadow-2xl ${isTopPerformer ? 'ring-2 ring-amber-400/30' : ''} ${isForming ? 'ring-2 ring-blue-400/40 shadow-lg shadow-blue-400/10' : ''}`}>
            {isTopPerformer && (
              <div className="absolute right-0 top-0 z-20">
                <div className="flex items-center gap-2 rounded-bl-2xl bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2 shadow-lg">
                  <svg className="h-4 w-4 text-zinc-900" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="text-xs font-bold text-zinc-900">{t("Хамгийн өндөр", "Top Performer")}</span>
                </div>
              </div>
            )}
            
            {isForming && (
              <div className="absolute left-0 top-0 z-20">
                <div className="flex items-center gap-2 rounded-br-2xl bg-gradient-to-r from-blue-500 to-blue-400 px-4 py-2 shadow-lg shadow-blue-500/30">
                  <svg className="h-4 w-4 animate-pulse text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="text-xs font-bold text-white">{t("Бүрдэж байна!", "Forming Now!")}</span>
                </div>
              </div>
            )}
            
            <div className={`absolute -right-10 -top-10 h-48 w-48 rounded-full blur-3xl transition-all duration-700 group-hover:scale-150 ${
              isForming
                ? "bg-blue-500/15 group-hover:bg-blue-500/20"
                : live 
                ? s.side === "BUY" 
                  ? "bg-emerald-500/10 group-hover:bg-emerald-500/15" 
                  : "bg-red-500/10 group-hover:bg-red-500/15"
                : "bg-zinc-800/10"
            }`} aria-hidden />
            
            <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <div className="min-w-0 space-y-5">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-zinc-100">{s.name}</h2>
                    <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition-all duration-300 group-hover:scale-105 ${tone}`}>
                      <span aria-hidden className={`h-2 w-2 rounded-full ${dot} ${s.status === 'ACTIVE' ? 'animate-pulse' : ''}`} />
                      {label}
                    </span>
                  </div>
                  
                  <div className={`mt-4 flex items-baseline gap-3 text-2xl leading-tight font-bold tracking-tight transition-all duration-300 group-hover:scale-105 ${
                    !live ? "text-zinc-200" : s.side === "BUY" ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {live && <Dir d={s.side === "BUY" ? 1 : -1} className="text-3xl" />}
                    <span>{s.headline}</span>
                  </div>
                  
                  <p className="mt-3 max-w-prose text-sm leading-relaxed text-zinc-400">{s.detail}</p>
                </div>

                <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5 backdrop-blur-sm">
                  <Ladder s={s} t={t} />
                </div>

                {s.checks.length > 0 && (
                  <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5 backdrop-blur-sm">
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
                          <li key={c.label} className={`group/check relative flex items-start gap-3 rounded-lg py-2 px-1 transition-all duration-200 hover:bg-white/5 ${c.ok ? "text-zinc-200" : "text-zinc-500"}`}>
                            <span aria-hidden className={`relative z-10 mt-[3.5px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-[3px] transition-all duration-300 group-hover/check:scale-110 ${
                              c.ok 
                                ? "border-emerald-400 bg-emerald-400 shadow-lg shadow-emerald-400/20" 
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
              
              <div className="min-w-0">
                <div className="overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-4 backdrop-blur-sm">
                  <SetupChart candles={candles} side={s.side} entry={s.entry} stop={s.stop} target={s.target} band={s.band} v={v} />
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-5 border-t border-zinc-800/50 pt-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5 backdrop-blur-sm transition-all duration-300 hover:border-zinc-700/50 hover:bg-zinc-900/50">
                <Record t={t} title={t("Түүхэн үр дүн, бүх хугацаа", "Historical record, all time")} h={s.history} />
              </div>
              <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5 backdrop-blur-sm transition-all duration-300 hover:border-zinc-700/50 hover:bg-zinc-900/50">
                <Record t={t} title={t("Сүүлийн 12 сар", "Last 12 months")} h={s.recent} />
              </div>
            </div>
            
            <details className="group/details mt-4">
              <summary className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-zinc-400 transition-all duration-200 hover:bg-zinc-800/50 hover:text-zinc-200">
                <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 transition-transform duration-300 group-open/details:rotate-180">
                  <path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t("Дүрмийг бүтнээр нь унших", "Read the full rule")}
              </summary>
              <div className="mt-3 rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-5 backdrop-blur-sm">
                <p className="max-w-prose leading-relaxed text-zinc-300">{s.rule}</p>
              </div>
            </details>
          </section>
        );
      })}

      <TelegramCard configured={telegramConfigured()} linked={!!user.telegramChatId} isAdmin={user.role === "ADMIN"} pending={user.telegramChatId ? null : pendingTelegram(user, new Date())} />

      <section className="table-card" aria-labelledby="signals-h">
        <h2 id="signals-h" className="px-4 pt-4 pb-2 text-[15px] font-semibold text-zinc-100 sm:px-5 sm:pt-5">{t("Сүүлийн дохионууд", "Recent signals")}</h2>
        {signals.length === 0 ? <p className="px-4 pb-4 text-sm text-zinc-500 sm:px-5 sm:pb-5">{t("Одоогоор дохио гараагүй. Setup идэвхжих бүрд энд бүртгэгдэнэ.", "No signals yet. Each time a setup becomes active it is recorded here.")}</p> : (
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-zinc-800">{([[`${t("Гарсан", "Time")} (${v.zone})`, ""], ["", ""], [t("Дүрэм", "Rule"), "hidden sm:table-cell"], [t("Орох", "Entry"), "text-right"], ["Stop", "text-right"], ["Target", "text-right"]] as const).map(([h, cls], i) => <th key={i} className={`th ${cls}`}>{h}</th>)}</tr></thead>
            <tbody>
              {signals.map((g) => (
                <tr key={g.id} className="border-t border-zinc-800/70 first:border-t-0">
                  <td className="td whitespace-nowrap text-zinc-400 tabular-nums">{v.dateTime(g.createdAt).slice(5)}</td>
                  <td className={`td font-semibold whitespace-nowrap ${g.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}><Dir d={g.side === "BUY" ? 1 : -1} /> {g.side}</td>
                  <td className="td hidden text-zinc-300 sm:table-cell">{view.setups.find((x) => x.id === g.setupId)?.name ?? g.name}</td>
                  <td className="td text-right font-medium text-zinc-100 tabular-nums">{px(g.entry)}</td>
                  <td className="td text-right text-red-400 tabular-nums">{px(g.stop)}</td>
                  <td className="td text-right text-emerald-400 tabular-nums">{px(g.target)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="max-w-prose text-xs leading-relaxed text-zinc-500">
        {t(`Түүхэн үр дүн нь хадгалагдсан лаанууд дээр (${view.historyFrom ? `${v.date(view.historyFrom)}-оос` : "дата ирмэгц"}) дүрмийг дахин тоглуулж гаргасан тоо: spread $0.30, лаан доторх stop-ыг target-аас түрүүлж тооцсон. R нь эрсдэлийн нэгж (stop хүртэлх зай). Энэ хоёр дүрмийн аль нь ч урьдчилан тавьсан шалгуурыг (шалгах хэсэгт дундаж R ≥ 0.1, profit factor ≥ 1.2) бүрэн даваагүй. Ирээдүйн үр дүнг батлахгүй, санхүүгийн зөвлөгөө биш.`,
          `The historical record comes from replaying the rule over the stored candles (${view.historyFrom ? `from ${v.date(view.historyFrom)}` : "once data arrives"}): a $0.30 spread, and a stop inside a candle counted before the target. R is the unit of risk (the distance to the stop). Neither of these two rules fully cleared the criteria set in advance (average R ≥ 0.1 and profit factor ≥ 1.2 on the test period). It does not guarantee future results and is not financial advice.`)}
      </p>
    </div>
  );
}
