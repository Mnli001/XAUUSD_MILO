import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { SectionLink } from "@/components/AppNav";
import { getT } from "@/lib/prefs.server";
import { BrandMark } from "@/components/BrandMark";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Админ — XAU Analytics", "Admin — XAU Analytics") };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  await requireAdmin();
  return (
    <div className="min-h-dvh bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-6xl items-stretch gap-2 px-4">
          {/* The app's brand mark, with the admin badge beside it. */}
          <span className="flex shrink-0 items-center gap-2.5 font-bold tracking-[-0.01em] text-zinc-50">
            <BrandMark />
            <span className="hidden font-display text-[18px] sm:inline">XAU Analytics</span>
            <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-xs font-semibold text-amber-300">{t("Админ", "Admin")}</span>
          </span>
          <nav aria-label={t("Админ цэс", "Admin menu")} className="ml-2 flex min-w-0 flex-1 items-stretch overflow-x-auto">
            <SectionLink href="/admin/users">{t("Хэрэглэгчид", "Users")}</SectionLink>
            <SectionLink href="/admin/revenue">{t("Орлого", "Revenue")}</SectionLink>
            <SectionLink href="/admin/payments">{t("Төлбөр", "Payments")}</SectionLink>
            <SectionLink href="/admin/events">{t("Мэдээ", "News")}</SectionLink>
            <SectionLink href="/admin/bot">{t("Ботын судалгаа", "Bot research")}</SectionLink>
          </nav>
          <Link href="/today" className="flex shrink-0 items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100">
            <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3"><path d="M7.5 2.5 4 6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="hidden sm:inline">{t("Систем рүү", "To the app")}</span><span className="sm:hidden">{t("Буцах", "Back")}</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:py-8">{children}</main>
    </div>
  );
}
