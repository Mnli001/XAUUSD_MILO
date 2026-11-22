import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { SectionLink } from "@/components/AppNav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Админ — XAU Analytics" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-stretch px-4">
          <span className="mr-2 flex shrink-0 items-center gap-2 font-semibold tracking-tight"><span aria-hidden className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-amber-400" />Админ</span>
          <nav aria-label="Админ цэс" className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
            <SectionLink href="/admin/users">Хэрэглэгчид</SectionLink>
            <SectionLink href="/admin/events">Мэдээ</SectionLink>
            <SectionLink href="/admin/bot">Ботын судалгаа</SectionLink>
          </nav>
          <Link href="/today" className="ml-2 flex shrink-0 items-center text-sm text-zinc-400 hover:text-zinc-100"><span aria-hidden className="mr-1">←</span><span className="hidden sm:inline">Систем рүү</span><span className="sm:hidden">Буцах</span></Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:py-7">{children}</main>
    </div>
  );
}
