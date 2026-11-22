"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/lib/actions/session";
import type { T } from "@/lib/i18n";
import { useT } from "./PrefsProvider";

const mainLinks = (t: T) => [
  ["/today", t("Өнөөдөр", "Today"), "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"],
  ["/setup", "Setup", "M12 2.5v4m0 11v4M2.5 12h4m11 0h4M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 3.5v2"],
  ["/chart", t("Чарт", "Chart"), "M7 4v3m0 8v5M5 7h4v8H5zM17 3v5m0 7v6M15 8h4v7h-4z"],
  ["/news", t("Мэдээ", "News"), "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 8h3m-3 3h6"],
  ["/journal", t("Журнал", "Journal"), "M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2V4Zm0 0v14a2 2 0 0 0 2 2M10 9h5m-5 4h5"],
  ["/bot", t("Бот", "Bot"), "M12 3v3M8 6h8a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Zm-5 6v3m18-3v3M9.5 12v1m5-1v1M9.5 16h5"],
] as const;
const moreLinks = (t: T) => [["/performance", t("Гүйцэтгэл", "Performance")], ["/settings", t("Тохиргоо", "Settings")]] as const;

const isCurrent = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** The signed-in shell: a top bar on wide screens, a thumb-reach tab bar on phones and tablets. */
export function AppNav({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const path = usePathname();
  const t = useT();
  const MAIN = mainLinks(t), MORE = moreLinks(t);
  // The menu remembers the page it was opened on, so moving to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (next: boolean | ((o: boolean) => boolean)) => setOpenOn((typeof next === "function" ? next(open) : next) ? path : null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setOpenOn(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const item = "flex min-h-11 items-center rounded-md px-3 text-sm text-zinc-200 hover:bg-zinc-800";
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <Link href="/today" className="mr-3 flex items-center gap-2 font-semibold tracking-tight text-zinc-50">
            <span aria-hidden className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-amber-400" />XAU Analytics
          </Link>
          <nav aria-label={t("Үндсэн цэс", "Main menu")} className="hidden h-full items-stretch lg:flex">
            {[...MAIN, ...MORE].map(([href, label]) => {
              const on = isCurrent(path, href);
              return (
                <Link key={href} href={href} aria-current={on ? "page" : undefined}
                  className={`flex items-center border-b-2 px-3 text-sm transition-colors ${on ? "border-amber-400 text-zinc-50" : "border-transparent text-zinc-400 hover:text-zinc-100"}`}>{label}</Link>
              );
            })}
          </nav>
          <div ref={menuRef} className="relative ml-auto">
            <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
              className="flex min-h-11 max-w-[11rem] items-center gap-2 rounded-lg px-2 text-sm text-zinc-300 hover:bg-zinc-900">
              <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-amber-300">{name.trim().charAt(0).toUpperCase() || "?"}</span>
              <span className="truncate">{name}</span>
              <svg aria-hidden viewBox="0 0 12 12" className={`h-3 w-3 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {open && (
              <div role="menu" className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-zinc-800 bg-zinc-900 p-1.5 shadow-xl shadow-black/40">
                {MORE.map(([href, label]) => <Link key={href} role="menuitem" href={href} className={`${item} lg:hidden`}>{label}</Link>)}
                {isAdmin && <Link role="menuitem" href="/admin/users" className={`${item} text-amber-300`}>{t("Админ", "Admin")}</Link>}
                <form action={logoutAction}><button role="menuitem" className={`${item} w-full text-left text-zinc-400`}>{t("Гарах", "Sign out")}</button></form>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav aria-label={t("Доод цэс", "Bottom menu")} className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-6">
          {MAIN.map(([href, label, d]) => {
            const on = isCurrent(path, href);
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] ${on ? "text-amber-400" : "text-zinc-500 hover:text-zinc-300"}`}>
                <svg aria-hidden viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

/** A link in a simple row of sections (the admin area) that knows when it is the current one. */
export function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  const on = isCurrent(usePathname(), href);
  return (
    <Link href={href} aria-current={on ? "page" : undefined}
      className={`flex h-full items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors ${on ? "border-amber-400 text-zinc-50" : "border-transparent text-zinc-400 hover:text-zinc-100"}`}>{children}</Link>
  );
}
