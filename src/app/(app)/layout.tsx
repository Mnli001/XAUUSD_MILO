import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/session";
import { Disclaimer } from "@/components/Disclaimer";

export const dynamic = "force-dynamic";

const NAV = [
  ["/today", "Өнөөдөр"], ["/chart", "Чарт"], ["/news", "Мэдээ"],
  ["/journal", "Журнал"], ["/performance", "Гүйцэтгэл"], ["/bot", "Бот"], ["/settings", "Тохиргоо"],
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-800">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
          <Link href="/today" className="mr-2 font-bold text-amber-400">XAU Analytics</Link>
          {NAV.map(([href, label]) => <Link key={href} href={href} className="text-zinc-300 hover:text-white">{label}</Link>)}
          {user.role === "ADMIN" && <Link href="/admin/users" className="text-amber-300 hover:text-amber-200">Админ</Link>}
          <span className="ml-auto text-zinc-500">{user.name}</span>
          <form action={logoutAction}><button className="text-zinc-400 hover:text-white">Гарах</button></form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <Disclaimer />
    </div>
  );
}
