"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/lib/actions/session";
import type { T } from "@/lib/i18n";
import { useT } from "./PrefsProvider";
import { BrandName } from "./BrandMark";

const mainLinks = (t: T) => [
  ["/today", t("Өнөөдөр", "Today"), "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"],
  ["/setup", "Setup", "M12 2.5v4m0 11v4M2.5 12h4m11 0h4M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 3.5v2"],
  ["/chart", t("Чарт", "Chart"), "M7 4v3m0 8v5M5 7h4v8H5zM17 3v5m0 7v6M15 8h4v7h-4z"],
  ["/news", t("Мэдээ", "News"), "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 8h3m-3 3h6"],
  ["/journal", t("Журнал", "Journal"), "M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2V4Zm0 0v14a2 2 0 0 0 2 2M10 9h5m-5 4h5"],
  ["/bot", t("Бот", "Bot"), "M12 3v3M8 6h8a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Zm-5 6v3m18-3v3M9.5 12v1m5-1v1M9.5 16h5"],
] as const;
const moreLinks = (t: T) => [
  ["/performance", t("Гүйцэтгэл", "Performance"), "M4 19h16M7 16V9m5 7V5m5 11v-4"],
  ["/settings", t("Тохиргоо", "Settings"), "M4 7h9m4 0h3M4 17h3m4 0h9M15 4.5v5M9 14.5v5"],
] as const;

const isCurrent = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

function Brand() {
  return (
    <Link href="/today" aria-label="XAU Analytics"><BrandName /></Link>
  );
}

/**
 * The signed-in shell. Wide screens get a rail drawn as a line with stations: each page is a stop,
 * the current one filled. Phones and tablets get a slim top bar and a thumb-reach tab bar.
 */
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
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  // One account menu: pinned into the top bar on phones, to the foot of the rail on wide screens.
  const userMenu = (
    <div ref={menuRef} className="fixed top-[calc(env(safe-area-inset-top)+0.375rem)] right-3 z-40 lg:top-auto lg:right-auto lg:bottom-5 lg:left-4 lg:w-52">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="flex min-h-11 w-full max-w-[13rem] items-center gap-2.5 rounded-lg px-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800">
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-100">{initial}</span>
        <span className="truncate max-lg:sr-only">{name}</span>
        <svg aria-hidden viewBox="0 0 12 12" className={`ml-auto h-3 w-3 shrink-0 text-zinc-500 max-lg:hidden transition-transform ${open ? "rotate-180" : ""}`}><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-40 mt-1 w-56 rounded-xl border border-zinc-800 bg-zinc-900 p-1.5 shadow-xl shadow-black/40 lg:top-auto lg:right-auto lg:bottom-full lg:left-0 lg:mt-0 lg:mb-1">
          {MORE.map(([href, label]) => <Link key={href} role="menuitem" href={href} className={`${item} lg:hidden`}>{label}</Link>)}
          {isAdmin && <Link role="menuitem" href="/admin/users" className={`${item} text-amber-300`}>{t("Админ", "Admin")}</Link>}
          <form action={logoutAction}><button role="menuitem" className={`${item} w-full text-left text-zinc-400`}>{t("Гарах", "Sign out")}</button></form>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Wide screens: a quiet glass rail. The current page carries a gold edge and gold icon. */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r px-4 py-6 lg:flex" style={{ borderColor: "var(--hairline)", background: "linear-gradient(180deg, rgb(255 255 255 / 0.025), transparent 40%)" }}>
        <div className="px-3"><Brand /></div>
        <nav aria-label={t("Үндсэн цэс", "Main menu")} className="mt-10 flex-1">
          <ul className="space-y-1">
            {[...MAIN, ...MORE].map(([href, label, d]) => {
              const on = isCurrent(path, href);
              return (
                <li key={href}>
                  <Link href={href} aria-current={on ? "page" : undefined}
                    className={`group relative flex min-h-11 items-center gap-3.5 rounded-xl px-3 text-[14.5px] transition-colors duration-200 ${on ? "font-bold text-zinc-50" : "font-medium text-zinc-400 hover:text-zinc-100"}`}
                    style={on ? { background: "linear-gradient(90deg, rgb(217 181 102 / 0.16), rgb(217 181 102 / 0.02))", boxShadow: "inset 0 0 0 1px var(--hairline-gold)" } : undefined}>
                    <svg aria-hidden viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 transition-colors duration-200 ${on ? "text-amber-400" : "text-zinc-500 group-hover:text-zinc-300"}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="h-12" />
      </aside>

      {/* Phones and tablets: a slim top bar. */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/70 bg-zinc-950/75 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center gap-2 px-4"><Brand /></div>
      </header>
      {userMenu}

      <nav aria-label={t("Доод цэс", "Bottom menu")} className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800/70 bg-zinc-950/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-6">
          {MAIN.map(([href, label, d]) => {
            const on = isCurrent(path, href);
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${on ? "text-amber-400" : "text-zinc-500 hover:text-zinc-300"}`}>
                <span aria-hidden className={`absolute top-0 h-[2px] w-9 rounded-b-full transition-colors ${on ? "bg-amber-400" : "bg-transparent"}`} />
                <svg aria-hidden viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={on ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
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
      className={`flex h-full items-center gap-2 border-b-[3px] px-3 text-sm whitespace-nowrap transition-colors ${on ? "border-amber-400 font-semibold text-zinc-50" : "border-transparent text-zinc-400 hover:text-zinc-100"}`}>{children}</Link>
  );
}
