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
] as const;

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user && hasAccess(user, new Date())) redirect("/today");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <span className="font-bold text-amber-400">XAU Analytics</span>
        <Link href="/login" className="btn-ghost">Нэвтрэх</Link>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <h1 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">Алтны зах зээлийг <span className="text-amber-400">тоогоор</span> хар</h1>
        <p className="mt-4 max-w-2xl text-lg text-zinc-300">XAUUSD-ийн өнөөдрийн чиглэл, цаг тутмын өсөх, унах магадлал, мэдээний цаг, өөрийн арилжааны гүйцэтгэл — бүгд нэг дор.</p>
        <div className="mt-6 flex gap-3">
          <Link href="/register" className="btn">Бүртгүүлэх</Link>
          <Link href="/login" className="btn-ghost">Нэвтрэх</Link>
        </div>

        <div className="card mt-10 max-w-xl" aria-label="Жишээ самбар">
          <div className="text-xs text-zinc-500">Жишээ — бодит дата биш</div>
          <div className="mt-1 flex items-baseline gap-3"><span className="font-mono text-2xl font-semibold">4,102.35</span><span className="text-emerald-400">▲ 0.40%</span><span className="ml-auto font-semibold text-emerald-400">ӨСӨХ хандлага</span></div>
          <div className="mt-3 flex justify-between text-sm"><span className="text-emerald-400">Худалдан авагч 68%</span><span className="text-red-400">Худалдагч 32%</span></div>
          <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-red-500/70"><div className="bg-emerald-500" style={{ width: "68%" }} /></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><span>15:00 <span className="text-emerald-400">▲ 61% өсөх</span></span><span>21:30 <span className="text-amber-400">⚠ CPI мэдээ</span></span></div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(([title, body]) => <div key={title} className="card"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-zinc-400">{body}</p></div>)}
        </div>
      </main>
      <Disclaimer />
    </div>
  );
}
