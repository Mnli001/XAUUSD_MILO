import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { Disclaimer } from "@/components/Disclaimer";
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
  [t("Өнөөдөр аль тал давамгай вэ?", "Which side leads today?"), t("Өдөр, 4 цаг, 1 цаг, 15 минутын тренд, моментум, бүтцийг нэг оноонд нэгтгэж худалдан авагч, худалдагчийн аль нь давамгай байгааг харуулна.", "Trend, momentum and structure on the daily, 4-hour, 1-hour and 15-minute charts are combined into one score that shows whether buyers or sellers have the upper hand."), t("Өнөөдөр", "Today"), "var(--color-asia)"],
  [t("Аль цаг хөдөлдөг вэ?", "Which hours move?"), t("Сүүлийн 6 сарын түүхээс цаг бүрт алт хэдэн хувьд өсөж, хэдэн хувьд унаж байсныг таны цагаар гаргана. Түүвэр бага бол хувь харуулахгүй.", "From the last 6 months of history: for each hour, how often gold rose and how often it fell, on your own clock. No percentage when the sample is small."), t("Цагийн хуваарь", "Hour by hour"), "var(--color-london)"],
  [t("Хэзээ мэдээ гарах вэ?", "When is the next release?"), t("CPI, NFP, FOMC зэрэг мэдээ хэдэн цагт гарах, өмнө нь ийм мэдээний дараа алт 15, 30, 60 минутад хэрхэн хөдөлж байсныг харна.", "When CPI, NFP, FOMC and other releases come out, and how gold moved 15, 30 and 60 minutes after such releases before."), t("Мэдээ", "News"), "var(--color-ny)"],
  [t("Миний арилжаа сайжирч байна уу?", "Is my trading improving?"), t("Арилжаагаа бүртгэж win rate, P&L, profit factor, drawdown-оо сешн, гараг, цагаар задлан шинжилнэ.", "Record your trades and break down win rate, P&L, profit factor and drawdown by session, weekday and hour."), t("Журнал", "Journal"), "var(--color-zinc-400)"],
  [t("Робот ажиллуулж болох уу?", "Can I run a robot?"), t("Өөрийн MetaTrader 5-тай холбож, роботыг вэбээс асааж зогсооно. Арга нь шалгагдаагүй тул эхлээд demo дансаар туршина.", "Connect your own MetaTrader 5 and start or stop the robot from the web. The method is unproven, so try it on a demo account first."), t("Бот", "Bot"), "var(--color-zinc-400)"],
] as const;

/** Illustration only: shaped like the real table, labelled as a sample below it. */
const SAMPLE_HOURS = [["15:00", "Лондон", 61, true, false], ["21:00", "Нью-Йорк", 57, false, true], ["22:00", "Нью-Йорк", 54, true, true], ["23:00", "Нью-Йорк", 58, true, false]] as const; // i18n-ok: session keys, shown through sessionLabel()

export default async function LandingPage() {
  const v = await getViewer();
  const { t } = v;
  const user = await getSessionUser();
  if (user && hasAccess(user, new Date())) redirect("/today");
  const now = new Date();
  const [events, snap, day] = await Promise.all([getEvents(now, new Date(now.getTime() + 24 * 36e5)), getTodaySnapshot(SYMBOL, now), loadCandles(SYMBOL, "15min", 96)]);
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

          <div className="reveal mx-auto grid w-full max-w-7xl items-center gap-12 px-5 pt-10 pb-20 sm:px-8 sm:pt-16 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16 lg:pt-24 lg:pb-36">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold text-amber-300 backdrop-blur-md" style={{ borderColor: "var(--hairline-gold)", background: "rgb(11 10 9 / 0.45)" }}>
                <span className="now-pulse h-1.5 w-1.5 rounded-full bg-amber-300" />{t("Алтны зах зээл, Улаанбаатарын цагаар", "The gold market, on Ulaanbaatar time")}
              </p>
              <h1 className="font-display mt-6 max-w-[13ch] text-[clamp(2.9rem,7.4vw,6.2rem)] leading-[0.98] text-zinc-50">
                {t("Алтны өдөр,", "Gold's day,")} <span className="gold-text">{t("цаг цагаараа.", "hour by hour.")}</span>
              </h1>
              <p className="mt-7 max-w-[44ch] text-lg leading-relaxed text-zinc-300 sm:text-xl">{t("Өнөөдөр аль тал давамгай, аль цаг өсөх эсвэл унах хандлагатай, дараагийн мэдээ хэзээ гарахыг Улаанбаатарын цагаар, түүхэн тоогоор харуулна.", "Which side leads today, which hours lean up or down, and when the next release lands, on Ulaanbaatar time and from historical numbers.")}</p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link href="/register" className="btn sheen min-h-13 px-8 text-[15px] max-sm:flex-1">{t("Бүртгүүлэх", "Register")}</Link>
                <Link href="/login" className="btn-ghost min-h-13 px-7 text-[15px] backdrop-blur-md max-sm:flex-1">{t("Нэвтрэх", "Sign in")}</Link>
              </div>
            </div>

            {/* The market right now, from the same data the app reads. */}
            <aside className="rounded-[28px] border p-6 backdrop-blur-2xl sm:p-7" aria-label={t("Одоогийн зах зээл", "The market right now")}
              style={{ borderColor: "rgb(255 255 255 / 0.14)", background: "linear-gradient(180deg, rgb(20 18 15 / 0.72), rgb(11 10 9 / 0.82))", boxShadow: "0 1px 0 rgb(255 255 255 / 0.12) inset, 0 40px 80px -30px rgb(0 0 0 / 0.9)" }}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-semibold tracking-[0.08em] text-amber-400">XAUUSD</span>
                <span className="text-zinc-400 tabular-nums">{v.time(now)} {v.zone}</span>
              </div>
              {snap.price ? (
                <>
                  <p className="font-display mt-3 text-[46px] leading-none text-zinc-50 sm:text-[54px]">{money(snap.price.last)}</p>
                  <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    {snap.price.changePct !== null && <span className={`rounded-full px-2.5 py-1 font-bold tabular-nums ${up ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}><Dir d={up ? 1 : -1} /> {up ? "+" : "−"}{Math.abs(snap.price.changePct).toFixed(2)}%</span>}
                    {snap.bias && <span className={`font-semibold ${dir > 0 ? "text-emerald-400" : dir < 0 ? "text-red-400" : "text-zinc-300"}`}>{biasLabelText(snap.bias.label, t)}</span>}
                    {snap.price.stale && <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-300">{t("Хоцролттой", "Delayed")}</span>}
                  </p>
                  <PriceSpark closes={day.map((c) => c.close)} className="mt-5 h-20" />
                </>
              ) : <p className="mt-4 text-sm text-zinc-400">{t("Дата ачаалж байна", "Loading data")}</p>}
              <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--hairline)" }}>
                <SessionLine now={now} arrivals={upcoming.map((e) => ({ time: e.time, label: eventTitle(e, t) }))} v={v} />
              </div>
            </aside>
          </div>
        </section>

        {/* A sample of the hour table, beside what it means. */}
        <section className="mx-auto grid w-full max-w-7xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[minmax(0,28rem)_1fr] lg:gap-20">
          <div>
            <h2 className="font-display text-[34px] leading-[1.08] text-zinc-50 sm:text-[48px]">{t("Цаг бүр нэг мөр.", "One row per hour.")}</h2>
            <p className="mt-5 max-w-[42ch] text-[17px] leading-relaxed text-zinc-400">{t("Хуваарь шиг уншина: цаг, сешн, тухайн цагт алт хэдэн хувьд өсөж эсвэл унаж байсан, хэдэн өдрөөс тооцсон. Мэдээтэй цагийг тэмдэглэнэ.", "Read it like a timetable: the hour, the session, how often gold rose or fell in that hour, and over how many days. Hours with a release are flagged.")}</p>
          </div>
          <figure className="m-0">
            <div className="table-card">
              <table className="w-full text-[15px]">
                <tbody>
                  {SAMPLE_HOURS.map(([h, session, pct, up, news], i) => (
                    <tr key={h} className={`border-t first:border-t-0 ${i === 0 ? "bg-amber-400/[0.06]" : ""}`} style={{ borderColor: "var(--hairline)" }}>
                      <td className="py-5 pr-3 pl-5 sm:pl-7">
                        <span className="flex items-center gap-3"><span aria-hidden className="h-7 w-[5px] rounded-full" style={{ background: sessionColor(session) }} /><span className="font-display text-[22px] text-zinc-50">{v.ub(h)}</span></span>
                      </td>
                      <td className="py-5 pr-3 text-zinc-400">{sessionLabel(session, t)}</td>
                      <td className="py-5 pr-5 sm:pr-7">
                        <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                          {news && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300"><span aria-hidden className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-amber-400" />CPI</span>}
                          <span className={`font-bold whitespace-nowrap ${up ? "text-emerald-400" : "text-red-400"}`}><Dir d={up ? 1 : -1} /> {pct}% {up ? t("өсөх", "up") : t("унах", "down")}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <figcaption className="mt-3 text-xs text-zinc-500">{t("Жишээ. Бодит дата биш.", "Sample. Not real data.")}</figcaption>
          </figure>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 sm:px-8" aria-labelledby="stops-h">
          <h2 id="stops-h" className="font-display max-w-[18ch] text-[34px] leading-[1.08] text-zinc-50 sm:text-[48px]">{t("Арилжааны өмнөх таван асуулт.", "Five questions before a trade.")}</h2>
          <ol className="mt-10 border-t" style={{ borderColor: "var(--hairline)" }}>
            {stops(t).map(([q, a, page], i) => (
              <li key={q} className="grid gap-x-10 gap-y-2 border-b py-7 transition-colors duration-300 hover:bg-white/[0.02] sm:grid-cols-[4rem_minmax(0,22rem)_1fr_auto] sm:px-3" style={{ borderColor: "var(--hairline)" }}>
                <span aria-hidden className="font-display gold-text text-[26px] leading-none">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-display text-[24px] leading-snug text-zinc-50">{q}</h3>
                <p className="max-w-[52ch] text-[15px] leading-relaxed text-zinc-400">{a}</p>
                <span className="self-start rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap text-zinc-300" style={{ borderColor: "var(--hairline)" }}>{page}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="sheen grid gap-8 rounded-[32px] px-7 py-10 sm:px-14 sm:py-14 lg:grid-cols-[1fr_auto] lg:items-end" style={{ background: "var(--accent-bg)", color: "var(--accent-fg)", boxShadow: "0 40px 80px -40px rgb(217 181 102 / 0.6)" }}>
            <div>
              <h2 className="font-display max-w-[20ch] text-[34px] leading-[1.08] sm:text-[48px]">{t("Тоо харуулна, зөвлөгөө өгөхгүй.", "Numbers, not advice.")}</h2>
              <p className="mt-4 max-w-[56ch] text-[16px] leading-relaxed font-medium">{t("Хувь бүрийн хажууд түүврийн тоо бий. Дата хангалтгүй бол тоо гаргахгүй. Backtest-ийн үр дүн, роботын эрсдэлийг нуухгүй. Бүртгүүлсний дараа админ эрхийг тань нээнэ.", "Every percentage shows its sample size. With too little data, no figure is shown. Backtest results and the robot's risks are not hidden. After you register, the admin opens your access.")}</p>
            </div>
            <Link href="/register" className="relative z-10 inline-flex min-h-13 items-center justify-center rounded-full bg-zinc-950 px-9 text-[15px] font-bold text-zinc-50 transition-transform duration-200 ease-out hover:scale-[1.03] active:scale-[0.97]">{t("Бүртгүүлэх", "Register")}</Link>
          </div>
        </section>
      </main>
      <Disclaimer v={v} />
    </div>
  );
}
