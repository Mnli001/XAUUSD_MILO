import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { SectionLink } from "@/components/AppNav";
import { getT } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Админ — XAU Analytics", "Admin — XAU Analytics") };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-stretch px-4">
          <span className="mr-2 flex shrink-0 items-center gap-2 font-semibold tracking-tight"><span aria-hidden className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-amber-400" />{t("Админ", "Admin")}</span>
          <nav aria-label={t("Админ цэс", "Admin menu")} className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
            <SectionLink href="/admin/users">{t("Хэрэглэгчид", "Users")}</SectionLink>
            <SectionLink href="/admin/events">{t("Мэдээ", "News")}</SectionLink>
            <SectionLink href="/admin/bot">{t("Ботын судалгаа", "Bot research")}</SectionLink>
          </nav>
          <Link href="/today" className="ml-2 flex shrink-0 items-center text-sm text-zinc-400 hover:text-zinc-100"><span aria-hidden className="mr-1">←</span><span className="hidden sm:inline">{t("Систем рүү", "To the app")}</span><span className="sm:hidden">{t("Буцах", "Back")}</span></Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:py-7">{children}</main>
    </div>
  );
}
