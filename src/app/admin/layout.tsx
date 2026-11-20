import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Админ — XAU Analytics" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800">
        <nav className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-3 text-sm">
          <span className="font-bold text-amber-400">Админ</span>
          <Link href="/admin/users" className="text-zinc-300 hover:text-white">Хэрэглэгчид</Link>
          <Link href="/admin/events" className="text-zinc-300 hover:text-white">Мэдээ</Link>
          <Link href="/today" className="ml-auto text-zinc-400 hover:text-white">← Систем рүү</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
