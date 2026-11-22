import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { Disclaimer } from "@/components/Disclaimer";
import { getViewer } from "@/lib/prefs.server";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { sessionLabel } from "@/lib/time";
import type { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const features = (t: T) => [
  [t("Өнөөдрийн чиглэл", "Today's direction"), t("Өдөр, 4 цаг, 1 цаг, 15 минутын чартын тренд, моментум, бүтцийг нэг оноонд нэгтгэж худалдан авагч, худалдагчийн аль нь давамгай байгааг харуулна.", "Trend, momentum and structure on the daily, 4-hour, 1-hour and 15-minute charts are combined into one score that shows whether buyers or sellers have the upper hand.")],
  [t("Цагийн магадлал", "Hourly odds"), t("Сүүлийн 6 сарын түүхээс цаг бүрт алт хэдэн хувьд өсөж, хэдэн хувьд унаж байсныг Улаанбаатарын цагаар гаргана.", "From the last 6 months of history: for each hour, how often gold rose and how often it fell, shown on your own clock.")],
  [t("Мэдээний календарь", "News calendar"), t("CPI, NFP, FOMC зэрэг мэдээ хэдэн цагт гарах, өмнө нь ийм мэдээний дараа алт хэрхэн хөдөлж байсныг харна.", "When CPI, NFP, FOMC and other releases come out, and how gold moved after such releases before.")],
  [t("Арилжааны журнал", "Trade journal"), t("Арилжаагаа бүртгэж win rate, P&L, profit factor, drawdown-оо сесс, гараг, цагаар задлан шинжилнэ.", "Record your trades and break down win rate, P&L, profit factor and drawdown by session, weekday and hour.")],
  [t("MT5 бот", "MT5 bot"), t("Өөрийн MetaTrader 5-тай холбож, роботыг вэбээс асааж зогсооно. Арга нь шалгагдаагүй тул эхлээд demo дансаар туршина.", "Connect your own MetaTrader 5 and start or stop the robot from the web. The method is unproven, so try it on a demo account first.")],
] as const;
const SAMPLE_HOURS = [["15:00", "Лондон", 61, true], ["21:00", "Нью-Йорк", 57, false], ["22:00", "Нью-Йорк", 54, true]] as const; // i18n-ok: session keys, shown through sessionLabel()

export default async function LandingPage() {
  const v = await getViewer();
  const { t } = v;
  const user = await getSessionUser();
  if (user && hasAccess(user, new Date())) redirect("/today");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <span className="flex items-center gap-2 font-semibold tracking-tight text-zinc-50"><span aria-hidden className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-amber-400" />XAU Analytics</span>
        <span className="flex items-center gap-2"><LanguageSwitch locale={v.locale} /><Link href="/login" className="btn-ghost">{t("Нэвтрэх", "Sign in")}</Link></span>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-14">
        <div className="grid items-center gap-10 pt-8 sm:pt-14 lg:grid-cols-[1fr_minmax(0,28rem)] lg:gap-14 lg:pt-20">
          <div>
            <h1 className="max-w-[15ch] text-[2.5rem] leading-[1.08] font-semibold tracking-tight text-zinc-50 sm:text-6xl">{t("Алтны зах зээлийг тоогоор хар", "See the gold market in numbers")}</h1>
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-zinc-300">{t("Алтны өнөөдрийн чиглэл, цаг тутмын өсөх, унах магадлал, мэдээний цаг, өөрийн арилжааны гүйцэтгэл нэг дор.", "Today's direction for gold, the odds of a rise or fall hour by hour, news times and your own trading performance in one place.")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="btn px-6 max-sm:flex-1">{t("Бүртгүүлэх", "Register")}</Link>
              <Link href="/login" className="btn-ghost px-6 max-sm:flex-1">{t("Нэвтрэх", "Sign in")}</Link>
            </div>
          </div>

          <figure className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6" aria-label={t("Жишээ самбар", "Sample dashboard")}>
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div>
                <div className="text-sm text-zinc-400">{t("Алт, XAUUSD", "Gold, XAUUSD")}</div>
                <div className="flex items-baseline gap-3"><span className="font-mono text-4xl font-semibold tracking-tight">4,102.35</span><span className="font-mono text-emerald-400">▲ 0.40%</span></div>
              </div>
              <div className="text-lg font-semibold text-emerald-400">{t("ӨСӨХ хандлага", "BULLISH bias")}</div>
            </div>
            <div className="mt-5 mb-1.5 flex justify-between gap-3 text-sm"><span className="text-emerald-400">{t("Худалдан авагч 68%", "Buyers 68%")}</span><span className="text-red-400">{t("Худалдагч 32%", "Sellers 32%")}</span></div>
            <div className="flex h-3 overflow-hidden rounded-full bg-red-500/70"><div className="bg-emerald-500" style={{ width: "68%" }} /></div>
            <table className="mt-5 w-full text-sm">
              <tbody>
                {SAMPLE_HOURS.map(([h, session, pct, up]) => (
                  <tr key={h} className="border-t border-zinc-800">
                    <td className="py-2.5 pr-3 font-mono">{v.ub(h)}</td>
                    <td className="py-2.5 pr-3 text-zinc-400">{sessionLabel(session, t)}</td>
                    <td className={`py-2.5 text-right whitespace-nowrap ${up ? "text-emerald-400" : "text-red-400"}`}>{up ? "▲" : "▼"} {pct}% {up ? t("өсөх", "up") : t("унах", "down")}</td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-800"><td className="py-2.5 pr-3 font-mono">{v.ub("21:30")}</td><td className="py-2.5 text-amber-400" colSpan={2}>{t("⚠ CPI мэдээ гарна", "⚠ CPI release")}</td></tr>
              </tbody>
            </table>
            <figcaption className="mt-4 text-xs text-zinc-500">{t("Жишээ самбар. Бодит дата биш.", "Sample dashboard. Not real data.")}</figcaption>
          </figure>
        </div>

        <dl className="mt-16 grid gap-x-10 gap-y-8 border-t border-zinc-800 pt-10 sm:grid-cols-2 lg:mt-24 lg:grid-cols-3">
          {features(t).map(([title, body]) => <div key={title}><dt className="font-semibold text-zinc-50">{title}</dt><dd className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-zinc-400">{body}</dd></div>)}
        </dl>
      </main>
      <Disclaimer v={v} />
    </div>
  );
}
