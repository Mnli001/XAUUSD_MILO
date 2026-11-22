import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { Disclaimer } from "@/components/Disclaimer";

export const dynamic = "force-dynamic";

const FEATURES = [
  ["Өнөөдрийн чиглэл", "Өдөр, 4 цаг, 1 цаг, 15 минутын чартын тренд, моментум, бүтцийг нэг оноонд нэгтгэж худалдан авагч, худалдагчийн аль нь давамгай байгааг харуулна."],
  ["Цагийн магадлал", "Сүүлийн 6 сарын түүхээс цаг бүрт алт хэдэн хувьд өсөж, хэдэн хувьд унаж байсныг Улаанбаатарын цагаар гаргана."],
  ["Мэдээний календарь", "CPI, NFP, FOMC зэрэг мэдээ хэдэн цагт гарах, өмнө нь ийм мэдээний дараа алт хэрхэн хөдөлж байсныг харна."],
  ["Арилжааны журнал", "Арилжаагаа бүртгэж win rate, P&L, profit factor, drawdown-оо сесс, гараг, цагаар задлан шинжилнэ."],
  ["MT5 бот", "Өөрийн MetaTrader 5-тай холбож, роботыг вэбээс асааж зогсооно. Арга нь шалгагдаагүй тул эхлээд demo дансаар туршина."],
] as const;
const SAMPLE_HOURS = [["15:00", "Лондон", 61, true], ["21:00", "Нью-Йорк", 57, false], ["22:00", "Нью-Йорк", 54, true]] as const;

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user && hasAccess(user, new Date())) redirect("/today");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <span className="flex items-center gap-2 font-semibold tracking-tight text-zinc-50"><span aria-hidden className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-amber-400" />XAU Analytics</span>
        <Link href="/login" className="btn-ghost">Нэвтрэх</Link>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-14">
        <div className="grid items-center gap-10 pt-8 sm:pt-14 lg:grid-cols-[1fr_minmax(0,28rem)] lg:gap-14 lg:pt-20">
          <div>
            <h1 className="max-w-[15ch] text-[2.5rem] leading-[1.08] font-semibold tracking-tight text-zinc-50 sm:text-6xl">Алтны зах зээлийг тоогоор хар</h1>
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-zinc-300">Алтны өнөөдрийн чиглэл, цаг тутмын өсөх, унах магадлал, мэдээний цаг, өөрийн арилжааны гүйцэтгэл нэг дор.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="btn px-6 max-sm:flex-1">Бүртгүүлэх</Link>
              <Link href="/login" className="btn-ghost px-6 max-sm:flex-1">Нэвтрэх</Link>
            </div>
          </div>

          <figure className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6" aria-label="Жишээ самбар">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div>
                <div className="text-sm text-zinc-400">Алт, XAUUSD</div>
                <div className="flex items-baseline gap-3"><span className="font-mono text-4xl font-semibold tracking-tight">4,102.35</span><span className="font-mono text-emerald-400">▲ 0.40%</span></div>
              </div>
              <div className="text-lg font-semibold text-emerald-400">ӨСӨХ хандлага</div>
            </div>
            <div className="mt-5 mb-1.5 flex justify-between gap-3 text-sm"><span className="text-emerald-400">Худалдан авагч 68%</span><span className="text-red-400">Худалдагч 32%</span></div>
            <div className="flex h-3 overflow-hidden rounded-full bg-red-500/70"><div className="bg-emerald-500" style={{ width: "68%" }} /></div>
            <table className="mt-5 w-full text-sm">
              <tbody>
                {SAMPLE_HOURS.map(([h, session, pct, up]) => (
                  <tr key={h} className="border-t border-zinc-800">
                    <td className="py-2.5 pr-3 font-mono">{h}</td>
                    <td className="py-2.5 pr-3 text-zinc-400">{session}</td>
                    <td className={`py-2.5 text-right whitespace-nowrap ${up ? "text-emerald-400" : "text-red-400"}`}>{up ? "▲" : "▼"} {pct}% {up ? "өсөх" : "унах"}</td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-800"><td className="py-2.5 pr-3 font-mono">21:30</td><td className="py-2.5 text-amber-400" colSpan={2}>⚠ CPI мэдээ гарна</td></tr>
              </tbody>
            </table>
            <figcaption className="mt-4 text-xs text-zinc-500">Жишээ самбар. Бодит дата биш.</figcaption>
          </figure>
        </div>

        <dl className="mt-16 grid gap-x-10 gap-y-8 border-t border-zinc-800 pt-10 sm:grid-cols-2 lg:mt-24 lg:grid-cols-3">
          {FEATURES.map(([title, body]) => <div key={title}><dt className="font-semibold text-zinc-50">{title}</dt><dd className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-zinc-400">{body}</dd></div>)}
        </dl>
      </main>
      <Disclaimer />
    </div>
  );
}
