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
  const upcoming = (await getEvents(now, new Date(now.getTime() + 24 * 36e5))).filter((e) => e.impact === "HIGH");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <span className="flex items-center gap-2.5 font-bold tracking-[-0.01em] text-zinc-50">
          <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400"><span className="h-2 w-2 rounded-full bg-zinc-950" /></span>
          XAU Analytics
        </span>
        <span className="flex items-center gap-2"><LanguageSwitch locale={v.locale} /><Link href="/login" className="btn-ghost">{t("Нэвтрэх", "Sign in")}</Link></span>
      </header>

      <main className="flex-1">
        {/* The thesis: the day itself, drawn as a line, before any card. */}
        <section className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6 sm:pt-16 lg:pt-20">
          <h1 className="max-w-[16ch] text-[2.75rem] leading-[1.02] font-extrabold tracking-[-0.035em] text-zinc-50 sm:text-7xl">
            {t("Алтны өдөр, цаг цагаараа.", "Gold's day, hour by hour.")}
          </h1>
          <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <p className="max-w-[46ch] text-lg leading-relaxed text-zinc-300">{t("Өнөөдөр аль тал давамгай, аль цаг өсөх эсвэл унах хандлагатай, дараагийн мэдээ хэзээ гарахыг Улаанбаатарын цагаар, түүхэн тоогоор харуулна.", "Which side leads today, which hours lean up or down, and when the next release lands, on Ulaanbaatar time and from historical numbers.")}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/register" className="btn px-6 max-sm:flex-1">{t("Бүртгүүлэх", "Register")}</Link>
              <Link href="/login" className="btn-ghost px-6 max-sm:flex-1">{t("Нэвтрэх", "Sign in")}</Link>
            </div>
          </div>

          <div className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 pt-5 pb-4 sm:mt-14 sm:px-7 sm:pt-7" style={{ boxShadow: "var(--shadow-panel)" }}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-[15px] font-semibold text-zinc-100">{t("Өнөөдрийн шугам", "Today's line")}</h2>
              <p className="text-[13px] text-zinc-400">{t("Одоо", "Now")} <span className="font-semibold text-zinc-100 tabular-nums">{v.time(now)}</span> {v.zone}</p>
            </div>
            <SessionLine big now={now} arrivals={upcoming.map((e) => ({ time: e.time, label: eventTitle(e, t) }))} v={v} />
          </div>
        </section>

        {/* A sample of the hour table, beside what it means. */}
        <section className="mx-auto mt-16 grid w-full max-w-6xl gap-10 px-4 sm:mt-24 sm:px-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16">
          <div>
            <h2 className="text-3xl font-bold tracking-[-0.025em] text-zinc-50 sm:text-4xl">{t("Цаг бүр нэг мөр.", "One row per hour.")}</h2>
            <p className="mt-4 max-w-[42ch] leading-relaxed text-zinc-400">{t("Хуваарь шиг уншина: цаг, сешн, тухайн цагт алт хэдэн хувьд өсөж эсвэл унаж байсан, хэдэн өдрөөс тооцсон. Мэдээтэй цагийг тэмдэглэнэ.", "Read it like a timetable: the hour, the session, how often gold rose or fell in that hour, and over how many days. Hours with a release are flagged.")}</p>
          </div>
          <figure className="m-0">
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900" style={{ boxShadow: "var(--shadow-panel)" }}>
              <table className="w-full text-sm">
                <tbody>
                  {SAMPLE_HOURS.map(([h, session, pct, up, news], i) => (
                    <tr key={h} className={`border-t border-zinc-800 first:border-t-0 ${i === 0 ? "bg-zinc-800/45" : ""}`}>
                      <td className="py-3.5 pr-3 pl-4 sm:pl-5">
                        <span className="flex items-center gap-2.5"><span aria-hidden className="h-6 w-[5px] rounded-full" style={{ background: sessionColor(session) }} /><span className="text-[15px] font-semibold text-zinc-50 tabular-nums">{v.ub(h)}</span></span>
                      </td>
                      <td className="py-3.5 pr-3 text-zinc-400">{sessionLabel(session, t)}</td>
                      <td className="py-3.5 pr-4 sm:pr-5">
                        <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                          {news && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-300"><span aria-hidden className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-amber-400" />CPI</span>}
                          <span className={`font-semibold whitespace-nowrap ${up ? "text-emerald-400" : "text-red-400"}`}><Dir d={up ? 1 : -1} /> {pct}% {up ? t("өсөх", "up") : t("унах", "down")}</span>
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

        <section className="mx-auto mt-16 w-full max-w-6xl px-4 sm:mt-24 sm:px-6" aria-labelledby="stops-h">
          <h2 id="stops-h" className="text-3xl font-bold tracking-[-0.025em] text-zinc-50 sm:text-4xl">{t("Арилжааны өмнөх таван асуулт.", "Five questions before a trade.")}</h2>
          <ol className="relative mt-8">
            <span aria-hidden className="absolute top-4 bottom-4 left-[5px] w-[3px] rounded-full bg-zinc-800" />
            {stops(t).map(([q, a, page, color]) => (
              <li key={q} className="relative grid gap-x-8 gap-y-1.5 border-t border-zinc-800 py-6 pl-9 first:border-t-0 sm:grid-cols-[minmax(0,20rem)_1fr_auto]">
                <span aria-hidden className="absolute top-[1.85rem] left-0 h-[13px] w-[13px] rounded-full border-[3px] bg-zinc-950" style={{ borderColor: color }} />
                <h3 className="text-lg leading-snug font-semibold text-zinc-50">{q}</h3>
                <p className="max-w-[54ch] text-sm leading-relaxed text-zinc-400">{a}</p>
                <span className="self-start text-[13px] font-medium whitespace-nowrap text-zinc-300 max-sm:mt-1">{page}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto mt-16 w-full max-w-6xl px-4 pb-16 sm:mt-24 sm:px-6 sm:pb-24">
          <div className="grid gap-8 rounded-2xl bg-amber-400 px-6 py-8 text-zinc-950 sm:px-10 sm:py-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h2 className="max-w-[22ch] text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{t("Тоо харуулна, зөвлөгөө өгөхгүй.", "Numbers, not advice.")}</h2>
              <p className="mt-3 max-w-[56ch] leading-relaxed">{t("Хувь бүрийн хажууд түүврийн тоо бий. Дата хангалтгүй бол тоо гаргахгүй. Backtest-ийн үр дүн, роботын эрсдэлийг нуухгүй. Бүртгүүлсний дараа админ эрхийг тань нээнэ.", "Every percentage shows its sample size. With too little data, no figure is shown. Backtest results and the robot's risks are not hidden. After you register, the admin opens your access.")}</p>
            </div>
            <Link href="/register" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-zinc-950 px-7 text-sm font-semibold text-zinc-50 transition-transform duration-150 ease-out hover:bg-zinc-900 active:scale-[0.98]">{t("Бүртгүүлэх", "Register")}</Link>
          </div>
        </section>
      </main>
      <Disclaimer v={v} />
    </div>
  );
}
