import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Disclaimer } from "@/components/Disclaimer";
import { signalHistory, PUBLIC_DELAY_MS, type SignalRow } from "@/lib/signalHistory";
import { SignalHistoryTable, SignalTotals } from "@/components/SignalHistory";
import { getViewer } from "@/lib/prefs.server";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { SessionLine, sessionColor } from "@/components/SessionLine";
import { getEvents } from "@/lib/events";
import { eventTitle } from "@/lib/data/calendarProvider";
import { sessionLabel } from "@/lib/time";
import type { T } from "@/lib/i18n";
import { Dir } from "@/components/Timetable";
import { BrandName } from "@/components/BrandMark";
import { GoldField } from "@/components/GoldField";
import { PriceSpark } from "@/components/PriceSpark";
import { getTodaySnapshot } from "@/lib/snapshot";
import { SYMBOL, loadCandles } from "@/lib/ingest/prices";
import { biasLabelText } from "@/lib/analysis/bias";

export const dynamic = "force-dynamic";

/** What the app answers, set as a departures list: the question, the answer, the page it lives on. */
const stops = (t: T) => [
  [t("Өнөөдөр зах зээл аль талдаа байна вэ?", "Which side commands the market today?"), t("D1, H4, H1, M15 цагийн тренд, моментум, зах зээлийн бүтцийг нэгтгэн худалдан авагч эсвэл худалдагчийн бодит хүчийг цэгцтэй тооцоолж харуулна.", "Combines D1, H4, H1, and M15 trend, momentum, and market structure into one clear score showing true buyer vs seller strength."), t("Өнөөдөр", "Today"), "var(--color-asia)"],
  [t("Алт хамгийн хүчтэй хөдөлдөг цагууд аль нь вэ?", "Which hours see the strongest gold volatility?"), t("Сүүлийн 6 сарын бодит түүхээс цаг бүрт алт өсөх эсвэл унах магадлалыг Улаанбаатарын цагаар нарийвчлан тооцно. Түүвэр хангалтгүй бол худал тоо харуулахгүй.", "Calculates the exact historical probability of gold rising or falling for each hour on Ulaanbaatar time from the last 6 months. Never fakes numbers when samples are insufficient."), t("Цагийн хуваарь", "Hour by hour"), "var(--color-london)"],
  [t("Эдийн засгийн хүчтэй мэдээнүүд хэзээ гарах вэ?", "When do high-impact economic releases drop?"), t("NFP, CPI, FOMC зэрэг алт савлуулах гол мэдээнүүд болон өмнө нь ижил мэдээний дараа алт 15, 30, 60 минутад дунджаар хэдэн ам.доллар хөдөлснийг шууд хянана.", "Track market-moving events like NFP, CPI, and FOMC, along with exactly how many dollars gold moved 15, 30, and 60 minutes after past releases."), t("Мэдээ", "News"), "var(--color-ny)"],
  [t("Таны арилжааны чадвар бодитоор өсөж байна уу?", "Is your trading edge genuinely growing?"), t("MT5 роботын хаасан арилжаа бүрээс Win rate, P&L, Profit factor, Drawdown-ыг сешн, гариг, цагаар нь автоматаар задлан, юу ажиллаж байгааг харуулна. Гараар юу ч бичих шаардлагагүй.", "Every trade your MT5 robot closes is broken down automatically into Win Rate, P&L, Profit Factor and Drawdown by session, day and hour, showing what works. Nothing to type in."), t("Гүйцэтгэл", "Performance"), "var(--color-zinc-400)"],
  [t("MT5 роботоо вэбээс шууд удирдах уу?", "Control your MT5 bot directly from the web?"), t("MetaTrader 5 терминалтайгаа шууд холбогдож, ботынхоо төлөв, эрсдэл, Start/Stop-ийг гар утсаараа ч хялбар удирдах боломжтой.", "Connect directly with your MetaTrader 5 terminal to seamlessly monitor bot state, risk parameters, and Start/Stop commands even from your phone."), t("Бот", "Bot"), "var(--color-zinc-400)"],
] as const;

/** Illustration only: shaped like the real table, labelled as a sample below it. */
const SAMPLE_HOURS = [["15:00", "Лондон", 61, true, false], ["21:00", "Нью-Йорк", 57, false, true], ["22:00", "Нью-Йорк", 54, true, true], ["23:00", "Нью-Йорк", 58, true, false]] as const; // i18n-ok: session keys, shown through sessionLabel()

export default async function LandingPage() {
  const v = await getViewer();
  const { t } = v;
  const user = await getSessionUser();
  if (user) redirect("/today");
  const now = new Date();
  let events: Awaited<ReturnType<typeof getEvents>> = [];
  let snap: Awaited<ReturnType<typeof getTodaySnapshot>> = { price: null, bias: null, hourly: null, levels: null };
  let day: Awaited<ReturnType<typeof loadCandles>> = [];
  let record: SignalRow[] = [];
  try {
    const res = await Promise.all([
      getEvents(now, new Date(now.getTime() + 24 * 36e5)),
      getTodaySnapshot(SYMBOL, now),
      loadCandles(SYMBOL, "15min", 96),
      signalHistory(now, 60, { delayMs: PUBLIC_DELAY_MS }),
    ]);
    events = res[0];
    snap = res[1];
    day = res[2];
    record = res[3];
  } catch (err) {
    console.warn("[landing] DB not reachable:", (err as Error).message);
  }
  const upcoming = events.filter((e) => e.impact === "HIGH");
  const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const up = (snap.price?.changePct ?? 0) >= 0;
  const dir = snap.bias?.label === "ӨСӨХ хандлага" ? 1 : snap.bias?.label === "УНАХ хандлага" ? -1 : 0; // i18n-ok: compared with the stored label

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1">
        {/* The hero: poured gold behind the words, the live market in glass in front of it. */}
        <section className="relative isolate overflow-hidden">
          <GoldField className="gold-field absolute inset-0 -z-10 h-full w-full" />
          <div aria-hidden className="absolute inset-0 -z-10" style={{ background: "linear-gradient(90deg, var(--color-zinc-950) 0%, color-mix(in oklab, var(--color-zinc-950) 55%, transparent) 42%, transparent 70%), linear-gradient(0deg, var(--color-zinc-950) 0%, transparent 28%)" }} />

          <header className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between gap-3 px-5 sm:px-8">
            <BrandName />
            <span className="flex items-center gap-2"><LanguageSwitch locale={v.locale} /><Link href="/login" className="btn-ghost backdrop-blur-md">{t("Нэвтрэх", "Sign in")}</Link></span>
          </header>

          <div className="reveal mx-auto grid w-full max-w-7xl items-center gap-16 px-5 pt-16 pb-24 sm:px-8 sm:pt-24 sm:pb-36 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-20 lg:pt-32 lg:pb-44">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-3 rounded-full border border-amber-400/30 bg-amber-400/10 px-5 py-2.5 backdrop-blur-xl">
                <span className="now-pulse h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)]" />
                <span className="text-sm font-bold tracking-wide text-amber-300">
                  {t("Алтны зах зээл, Улаанбаатарын цагаар", "The gold market, on Ulaanbaatar time")}
                </span>
              </div>
              
              <h1 className="font-display text-[clamp(3.2rem,8vw,7rem)] leading-[0.95] text-zinc-50">
                {t("Алтны зах зээл,", "Gold market clarity,")}
                <br />
                <span className="gold-text relative inline-block">
                  {t("хором хормоор.", "hour by hour.")}
                  <span className="absolute -inset-2 -z-10 blur-2xl opacity-40 bg-gradient-to-r from-amber-400 to-yellow-500" aria-hidden />
                </span>
              </h1>
              
              <p className="max-w-[46ch] text-xl leading-relaxed text-zinc-300 sm:text-2xl">
                {t("Өнөөдрийн давамгай чиглэл, цаг тутмын магадлал, эдийн засгийн мэдээнүүдийн нөлөөг Улаанбаатарын цагаар, ямар ч хуурамч таамаггүй цэвэр статистик өгөгдлөөр шинжилнэ.", "Track today's direction, hourly odds, and economic news reactions on Ulaanbaatar time — driven by clean, honest statistical data without market noise.")}
              </p>
              
              <div className="flex flex-wrap gap-4 pt-4">
                <Link 
                  href="/register" 
                  className="btn sheen group relative min-h-14 px-10 text-base font-bold shadow-[0_8px_30px_rgb(217,181,102,0.3)] transition-all duration-300 hover:shadow-[0_8px_40px_rgb(217,181,102,0.5)] hover:scale-105 active:scale-95 max-sm:flex-1"
                >
                  <span className="relative z-10">{t("Бүртгүүлэх", "Register")}</span>
                  <span className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 opacity-0 blur transition-opacity duration-300 group-hover:opacity-20" aria-hidden />
                </Link>
                <Link 
                  href="/login" 
                  className="btn-ghost bg-zinc-950/70 min-h-14 px-9 text-base font-semibold text-zinc-50 backdrop-blur-xl transition-all duration-300 hover:bg-zinc-950/85 hover:scale-105 active:scale-95 max-sm:flex-1"
                >
                  {t("Нэвтрэх", "Sign in")}
                </Link>
              </div>
              
              <div className="flex flex-wrap items-center gap-6 pt-4 text-sm text-zinc-400">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{t("Хуурамч таамаггүй", "No fake predictions")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{t("Бодит статистик", "Real statistics")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{t("MT5 робот нэгтгэлтэй", "MT5 bot integrated")}</span>
                </div>
              </div>
            </div>

            {/* The market right now, from the same data the app reads. */}
            <aside 
              className="group relative overflow-hidden rounded-[32px] border p-7 sm:p-8 backdrop-blur-xl transition-all duration-500 hover:scale-[1.02]" 
              aria-label={t("Одоогийн зах зээл", "The market right now")}
              style={{ 
                borderColor: "rgb(255 255 255 / 0.14)", 
                background: "linear-gradient(180deg, rgb(24 21 17 / 0.95), rgb(11 10 9 / 0.98))", 
                boxShadow: "0 1px 0 rgb(255 255 255 / 0.12) inset, 0 40px 100px -30px rgb(0 0 0 / 0.95), 0 20px 60px -20px rgb(217 181 102 / 0.1)" 
              }}
            >
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl transition-all duration-700 group-hover:scale-150 group-hover:bg-amber-400/15" aria-hidden />
              
              <div className="relative z-10">
                <div className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2 font-bold tracking-wider text-amber-400">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    XAUUSD
                  </span>
                  <span className="rounded-full bg-zinc-800/50 px-3 py-1 text-xs font-medium text-zinc-400 tabular-nums backdrop-blur-sm">
                    {v.time(now)} {v.zone}
                  </span>
                </div>
                
                {snap.price ? (
                  <>
                    <p className="num mt-5 text-[52px] font-bold leading-none text-zinc-50 sm:text-[64px] transition-all duration-300 group-hover:scale-105">
                      {money(snap.price.last)}
                    </p>
                    
                    <div className="mt-4 flex flex-wrap items-center gap-2.5">
                      {snap.price.changePct !== null && (
                        <span className={`rounded-xl px-4 py-2 font-bold tabular-nums shadow-lg transition-all duration-300 ${
                          up 
                            ? "bg-emerald-500/20 text-emerald-400 shadow-emerald-500/20" 
                            : "bg-red-500/20 text-red-400 shadow-red-500/20"
                        }`}>
                          <Dir d={up ? 1 : -1} /> {up ? "+" : "−"}{Math.abs(snap.price.changePct).toFixed(2)}%
                        </span>
                      )}
                      {snap.bias && (
                        <span className={`rounded-xl px-4 py-2 font-bold ${
                          dir > 0 
                            ? "bg-emerald-500/15 text-emerald-400" 
                            : dir < 0 
                            ? "bg-red-500/15 text-red-400" 
                            : "bg-zinc-700/50 text-zinc-300"
                        }`}>
                          {biasLabelText(snap.bias.label, t)}
                        </span>
                      )}
                      {snap.price.stale && (
                        <span className="rounded-xl bg-amber-400/15 px-3 py-1.5 text-xs font-semibold text-amber-300">
                          {t("Хоцролттой", "Delayed")}
                        </span>
                      )}
                    </div>
                    
                    <div className="mt-6 rounded-2xl bg-zinc-900/30 p-4 backdrop-blur-sm">
                      <PriceSpark closes={day.map((c) => c.close)} className="h-24" />
                    </div>
                  </>
                ) : (
                  <div className="mt-6 flex items-center gap-3 text-sm text-zinc-400">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400" />
                    <span>{t("Дата ачаалж байна", "Loading data")}</span>
                  </div>
                )}
                
                <div className="mt-6 rounded-2xl border border-zinc-800/50 bg-zinc-900/20 p-4 backdrop-blur-sm" style={{ borderColor: "var(--hairline)" }}>
                  <SessionLine now={now} arrivals={upcoming.map((e) => ({ time: e.time, label: eventTitle(e, t) }))} v={v} />
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* A sample of the hour table, beside what it means. */}
        <section className="mx-auto grid w-full max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-32 lg:grid-cols-[minmax(0,32rem)_1fr] lg:gap-24">
          <div className="space-y-6">
            <div className="inline-block rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-2">
              <span className="text-sm font-bold tracking-wide text-amber-400">
                {t("ЦАГИЙН ШИНЖИЛГЭЭ", "HOURLY ANALYSIS")}
              </span>
            </div>
            
            <h2 className="font-display text-[40px] leading-[1.05] text-zinc-50 sm:text-[56px]">
              {t("Цаг тутмын чиг хандлага нүдний өмнө.", "Hour-by-hour market pulse at a glance.")}
            </h2>
            
            <p className="max-w-[44ch] text-lg leading-relaxed text-zinc-400">
              {t("Цагийн хуваарь шиг цэгцтэй: цаг, арилжааны сешн, өнгөрсөн түүхэнд алт тухайн цагт өсөх эсвэл унах магадлал, хэдэн өдрийн дата дээр суурилсан зэргийг ил тод харна. Мэдээтэй цагуудыг урьдчилан анхааруулна.", "Clean and structured: session, hour, probability of gold rising or falling historically, and the sample size. Hours with major news are clearly highlighted.")}
            </p>
            
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20">
                  <svg className="h-4 w-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-zinc-200">{t("Түүхэн магадлал", "Historical probability")}</p>
                  <p className="text-sm text-zinc-500">{t("Сүүлийн 6 сарын бодит дата", "Based on last 6 months real data")}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20">
                  <svg className="h-4 w-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-zinc-200">{t("Мэдээний сануулга", "News alerts")}</p>
                  <p className="text-sm text-zinc-500">{t("Чухал мэдээтэй цагуудыг тэмдэглэнэ", "Important news hours highlighted")}</p>
                </div>
              </div>
            </div>
          </div>
          
          <figure className="m-0">
            <div className="table-card overflow-hidden rounded-2xl border border-zinc-800/50 bg-gradient-to-b from-zinc-900/50 to-zinc-950/50 backdrop-blur-sm shadow-2xl" style={{ boxShadow: "0 20px 60px -20px rgb(0 0 0 / 0.8)" }}>
              <table className="w-full text-base">
                <tbody>
                  {SAMPLE_HOURS.map(([h, session, pct, up, news], i) => (
                    <tr 
                      key={h} 
                      className={`group border-t first:border-t-0 transition-all duration-200 hover:bg-white/[0.03] ${i === 0 ? "bg-amber-400/[0.08]" : ""}`} 
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      <td className="py-6 pr-3 pl-6 sm:pl-8">
                        <span className="flex items-center gap-3.5">
                          <span 
                            aria-hidden 
                            className="h-8 w-[6px] rounded-full transition-all duration-300 group-hover:scale-110" 
                            style={{ background: sessionColor(session), boxShadow: `0 0 20px ${sessionColor(session)}40` }} 
                          />
                          <span className="num text-[26px] font-bold text-zinc-50 transition-colors duration-200 group-hover:text-amber-400">
                            {v.ub(h)}
                          </span>
                        </span>
                      </td>
                      <td className="py-6 pr-4 font-medium text-zinc-400 transition-colors duration-200 group-hover:text-zinc-300">
                        {sessionLabel(session, t)}
                      </td>
                      <td className="py-6 pr-6 sm:pr-8">
                        <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                          {news && (
                            <span className="inline-flex items-center gap-2 rounded-xl bg-amber-400/20 px-3 py-1.5 text-xs font-bold text-amber-300 shadow-lg shadow-amber-400/10 transition-all duration-200 group-hover:scale-105 group-hover:bg-amber-400/30">
                              <span aria-hidden className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                              CPI
                            </span>
                          )}
                          <span className={`rounded-xl px-4 py-2 font-bold whitespace-nowrap transition-all duration-200 group-hover:scale-105 ${
                            up 
                              ? "bg-emerald-500/15 text-emerald-400 group-hover:bg-emerald-500/25" 
                              : "bg-red-500/15 text-red-400 group-hover:bg-red-500/25"
                          }`}>
                            <Dir d={up ? 1 : -1} /> {pct}% {up ? t("өсөх", "up") : t("унах", "down")}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <figcaption className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              {t("Загвар харагдац. Бодит статистикийг систем дотроос харна уу.", "Sample preview. View real statistics inside the platform.")}
            </figcaption>
          </figure>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 sm:px-8" aria-labelledby="stops-h">
          <div className="mb-12 text-center">
            <div className="inline-block rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-2 mb-6">
              <span className="text-sm font-bold tracking-wide text-amber-400">
                {t("ҮНДСЭН БОЛОМЖУУД", "KEY FEATURES")}
              </span>
            </div>
            <h2 id="stops-h" className="font-display mx-auto max-w-[20ch] text-[40px] leading-[1.05] text-zinc-50 sm:text-[56px]">
              {t("Зах зээлд орохоос өмнө харах 5 гол хүчин зүйл.", "5 essential checks before entering the market.")}
            </h2>
          </div>
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {stops(t).map(([q, a, page, color], i) => (
              <div
                key={q}
                className="group relative overflow-hidden rounded-3xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/50 to-zinc-950/80 p-8 backdrop-blur-sm transition-all duration-500 hover:scale-[1.02] hover:border-zinc-700/50 hover:shadow-2xl"
                style={{ boxShadow: "0 20px 60px -20px rgb(0 0 0 / 0.6)" }}
              >
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-3xl transition-all duration-700 group-hover:opacity-20" style={{ background: color }} aria-hidden />
                
                <div className="relative z-10">
                  <div className="mb-5 flex items-center justify-between">
                    <span 
                      className="flex h-12 w-12 items-center justify-center rounded-2xl font-bold text-2xl transition-all duration-300 group-hover:scale-110" 
                      style={{ background: `${color}20`, color }}
                      aria-hidden
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span 
                      className="rounded-xl border px-3 py-1.5 text-xs font-semibold text-zinc-400 transition-colors duration-300 group-hover:border-zinc-600 group-hover:text-zinc-300" 
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      {page}
                    </span>
                  </div>
                  
                  <h3 className="font-display mb-4 text-[22px] leading-tight text-zinc-50 transition-colors duration-300 group-hover:text-amber-400">
                    {q}
                  </h3>
                  
                  <p className="text-[15px] leading-relaxed text-zinc-400 transition-colors duration-300 group-hover:text-zinc-300">
                    {a}
                  </p>
                  
                  <Link href="/register" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold transition-all duration-300 hover:gap-3" style={{ color }}>
                    <span>{t("Бүртгүүлээд үзэх", "Register to see it")}</span>
                    <span className="sr-only">: {q}</span>
                    <svg aria-hidden className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {record.some((r) => r.outcome.kind !== "OPEN") && (
          <section className="mx-auto w-full max-w-5xl px-5 pt-20 sm:px-8 sm:pt-32" aria-labelledby="record-h">
            <h2 id="record-h" className="font-display text-center text-[40px] leading-[1.05] text-zinc-50 sm:text-[56px]">{t("Дохионы бодит үр дүн", "How the signals actually did")}</h2>
            <p className="mx-auto mt-4 max-w-[60ch] text-center text-lg leading-relaxed text-zinc-400">{t("Гарсан дохио бүр, ашигтай нь ч алдагдалтай нь ч, яг хэрхэн дууссанаараа. Сүүлийн 24 цагийнх багцтай хэрэглэгчдэд шууд очдог тул энд нэг өдрийн дараа гарна.", "Every signal given, the winners and the losers, exactly as each one ended. The last 24 hours go to plan holders live, so they appear here a day later.")}</p>
            <div className="mt-10 space-y-5">
              <SignalTotals rows={record} t={t} />
              <div className="table-card"><SignalHistoryTable rows={record.slice(0, 8)} v={v} /></div>
              <p className="text-center text-sm text-zinc-500">{t("Spread, шимтгэл ороогүй. Өнгөрсөн үр дүн ирээдүйн ашгийг баталгаажуулахгүй.", "Spread and fees not included. Past results do not guarantee future profit.")}</p>
            </div>
          </section>
        )}

        <section className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-32">
          <div 
            className="sheen group relative overflow-hidden rounded-[40px] px-8 py-12 sm:px-16 sm:py-16 lg:px-20 lg:py-20 transition-all duration-500 hover:scale-[1.01]" 
            style={{ 
              background: "var(--accent-bg)", 
              color: "var(--accent-fg)", 
              boxShadow: "0 40px 100px -40px rgb(217 181 102 / 0.7), 0 0 0 1px rgb(217 181 102 / 0.1) inset" 
            }}
          >
            <div className="absolute inset-0 opacity-10 transition-opacity duration-700 group-hover:opacity-20" style={{ background: "radial-gradient(circle at 30% 50%, rgb(217 181 102 / 0.4), transparent 60%)" }} aria-hidden />
            <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-amber-500/20 blur-[100px] transition-all duration-1000 group-hover:scale-150" aria-hidden />
            
            <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[1fr_auto] lg:gap-16">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-xl bg-zinc-950/30 px-4 py-2 backdrop-blur-sm">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-bold">{t("100% илэн далангүй", "100% Transparent")}</span>
                </div>
                
                <h2 className="font-display max-w-[22ch] text-[40px] leading-[1.02] sm:text-[56px]">
                  {t("Тоо харуулна, зөвлөгөө өгөхгүй.", "Numbers, not advice.")}
                </h2>
                
                <p className="max-w-[58ch] text-lg leading-relaxed font-medium opacity-90">
                  {t("Хувь бүрийн хажууд түүврийн тоо бий. Дата хангалтгүй бол тоо гаргахгүй. Backtest-ийн үр дүн, роботын эрсдэлийг нуухгүй. Бүртгүүлээд багцаа сонгож төлмөгц эрх автоматаар нээгдэнэ.", "Every percentage shows its sample size. With too little data, no figure is shown. Backtest results and the robot's risks are not hidden. Register, choose a plan, and access opens the moment you pay.")}
                </p>
                
                <div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="flex items-start gap-3 rounded-2xl bg-zinc-950/30 p-4 backdrop-blur-sm">
                    <svg className="mt-0.5 h-6 w-6 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                      <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="font-bold">{t("Түүврийн тоо", "Sample size")}</p>
                      <p className="text-sm opacity-80">{t("Бүх статистикт", "On every stat")}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 rounded-2xl bg-zinc-950/30 p-4 backdrop-blur-sm">
                    <svg className="mt-0.5 h-6 w-6 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="font-bold">{t("Backtest үр дүн", "Backtest results")}</p>
                      <p className="text-sm opacity-80">{t("Нээлттэй", "Open to view")}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 rounded-2xl bg-zinc-950/30 p-4 backdrop-blur-sm">
                    <svg className="mt-0.5 h-6 w-6 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="font-bold">{t("Эрсдэлийн мэдээлэл", "Risk disclosure")}</p>
                      <p className="text-sm opacity-80">{t("Бүрэн ил тод", "Fully transparent")}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <Link 
                href="/register" 
                className="relative z-10 inline-flex min-h-14 items-center justify-center rounded-2xl bg-zinc-950 px-10 text-base font-bold text-zinc-50 shadow-2xl transition-all duration-300 hover:scale-105 hover:shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] active:scale-95 lg:min-h-16 lg:px-12 lg:text-lg"
              >
                <span className="relative z-10">{t("Бүртгүүлэх", "Register")}</span>
                <svg className="ml-2 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Disclaimer v={v} />
    </div>
  );
}
