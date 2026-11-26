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
  ["/performance", t("Гүйцэтгэл", "Performance"), "M4 19h16M7 16V9m5 7V5m5 11v-4"],
  ["/bot", t("Бот", "Bot"), "M12 3v3M8 6h8a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Zm-5 6v3m18-3v3M9.5 12v1m5-1v1M9.5 16h5"],
] as const;
const moreLinks = (t: T) => [
  ["/bot/history", t("Ботын түүх", "Bot history"), "M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4M12 8v4l3 2"],
  ["/plans", t("Багц", "Plans"), "M4 7h16v12H4zM4 7l2-3h12l2 3M9 11h6"],
  ["/glossary", t("Нэр томьёо", "Glossary"), "M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14H7.5A2.5 2.5 0 0 0 5 19.5m0-14v14m0 0A2.5 2.5 0 0 0 7.5 22H19v-5M9 7h6"],
  ["/settings", t("Тохиргоо", "Settings"), "M4 7h9m4 0h3M4 17h3m4 0h9M15 4.5v5M9 14.5v5"],
] as const;

const matches = (path: string, href: string) => path === href || path.startsWith(`${href}/`);
/** The page you are on: the longest link that matches, so /bot/history lights Bot history and not Bot. */
export function currentHref(path: string, hrefs: readonly string[]): string | null {
  return hrefs.filter((h) => matches(path, h)).sort((a, b) => b.length - a.length)[0] ?? null;
}

function Brand() {
  return (
    <Link href="/today" aria-label="XAU Analytics"><BrandName /></Link>
  );
}

/**
 * The signed-in shell. Wide screens get a rail drawn as a line with stations: each page is a stop,
 * the current one filled. Phones and tablets get a slim top bar with a Menu button that drops down every page,
 * and a thumb-reach tab bar with the six used most.
 */
export function AppNav({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const path = usePathname();
  const t = useT();
  const MAIN = mainLinks(t), MORE = moreLinks(t);
  const ALL = [...MAIN, ...MORE];
  const current = currentHref(path, ALL.map(([href]) => href));
  const inBottomBar = MAIN.some(([href]) => href === current);
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
  // The phone menu: every page, dropped down under the top bar. Same rules: a new page, Escape or a tap outside closes it.
  const [sheetOn, setSheetOn] = useState<string | null>(null);
  const sheet = sheetOn === path;
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sheet) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !sheetRef.current?.contains(e.target as Node)) setSheetOn(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [sheet]);

  const item = "flex min-h-11 items-center rounded-xl px-3 text-sm text-zinc-200 hover:bg-zinc-500/15";
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  // One account menu: pinned into the top bar on phones, to the foot of the rail on wide screens.
  const userMenu = (
    <div ref={menuRef} className="fixed bottom-7 left-7 z-40 hidden w-52 lg:block">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="flex min-h-11 w-full max-w-[13rem] items-center gap-2.5 rounded-full px-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-500/15">
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-100">{initial}</span>
        <span className="truncate">{name}</span>
        <svg aria-hidden viewBox="0 0 12 12" className={`ml-auto h-3 w-3 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div role="menu" className="glass-menu absolute bottom-full left-0 z-40 mb-1 w-56 rounded-[18px] p-1.5">
          {isAdmin && <Link role="menuitem" href="/admin/users" className={`${item} text-amber-300`}>{t("Админ", "Admin")}</Link>}
          <form action={logoutAction}><button role="menuitem" className={`${item} w-full text-left text-zinc-400`}>{t("Гарах", "Sign out")}</button></form>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Wide screens: a floating glass rail. The current page is a lit lozenge with a gold icon. */}
      <aside className="glass-bar sticky top-3 m-3 mr-0 hidden h-[calc(100dvh-1.5rem)] w-64 shrink-0 flex-col rounded-[30px] px-4 py-6 lg:flex">
        <div className="px-3"><Brand /></div>
        <nav aria-label={t("Үндсэн цэс", "Main menu")} className="mt-10 flex-1">
          <ul className="space-y-1">
            {ALL.map(([href, label, d]) => {
              const on = href === current;
              return (
                <li key={href}>
                  <Link href={href} aria-current={on ? "page" : undefined}
                    className={`group relative flex min-h-11 items-center gap-3.5 rounded-full px-3.5 text-[14.5px] transition-colors duration-200 ${on ? "font-bold text-zinc-50" : "font-medium text-zinc-400 hover:text-zinc-100"}`}
                    style={on ? { background: "linear-gradient(180deg, rgb(217 181 102 / 0.2), rgb(217 181 102 / 0.07))", boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.22), inset 0 0 0 1px var(--hairline-gold)" } : undefined}>
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
      <div ref={sheetRef} className="sticky top-0 z-40 lg:hidden">
        <header className="glass-bar pt-[env(safe-area-inset-top)]" style={{ boxShadow: "inset 0 -1px 0 var(--hairline)" }}>
          <div className="flex h-14 items-center gap-2 pr-2 pl-4">
            <Brand />
            <button type="button" onClick={() => setSheetOn(sheet ? null : path)} aria-expanded={sheet} aria-controls="all-pages"
              className={`relative ml-auto flex min-h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors ${sheet ? "bg-zinc-500/20 text-zinc-50" : "text-zinc-200 hover:bg-zinc-500/15"}`}>
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                {sheet ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
              {t("Цэс", "Menu")}
              {!sheet && !inBottomBar && current && <span aria-hidden className="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-400" />}
            </button>
          </div>
        </header>
        {sheet && (
          <nav id="all-pages" aria-label={t("Бүх хуудас", "All pages")}
            className="glass-menu menu-drop absolute inset-x-2.5 top-full mt-2 max-h-[calc(100dvh-env(safe-area-inset-top)-9.5rem)] overflow-y-auto rounded-[24px] p-2">
            <ul className="grid grid-cols-2 gap-1">
              {ALL.map(([href, label, d]) => {
                const on = href === current;
                return (
                  <li key={href}>
                    <Link href={href} aria-current={on ? "page" : undefined}
                      className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm transition-colors ${on ? "bg-amber-400/15 font-bold text-zinc-50" : "font-medium text-zinc-200 hover:bg-zinc-500/15"}`}>
                      <svg aria-hidden viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 ${on ? "text-amber-400" : "text-zinc-500"}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
                      <span className="min-w-0 truncate">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex items-center gap-2 border-t px-1 pt-2" style={{ borderColor: "var(--hairline)" }}>
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-100">{initial}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{name}</span>
              {isAdmin && <Link href="/admin/users" className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-amber-300 hover:bg-zinc-500/15">{t("Админ", "Admin")}</Link>}
              <form action={logoutAction}><button className="flex min-h-11 items-center rounded-xl px-3 text-sm text-zinc-400 hover:bg-zinc-500/15">{t("Гарах", "Sign out")}</button></form>
            </div>
          </nav>
        )}
      </div>
      {userMenu}

      <nav aria-label={t("Доод цэс", "Bottom menu")} className="glass-bar fixed inset-x-2.5 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-30 mx-auto max-w-xl rounded-[30px] p-1 lg:hidden">
        <div className="grid grid-cols-6">
          {MAIN.map(([href, label, d]) => {
            const on = href === current;
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined}
                className={`relative flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[26px] text-[10.5px] font-medium transition-colors ${on ? "text-amber-400" : "text-zinc-400 hover:text-zinc-200"}`}
                style={on ? { background: "linear-gradient(180deg, rgb(255 255 255 / 0.14), rgb(255 255 255 / 0.05))", boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.22), inset 0 0 0 1px var(--hairline)" } : undefined}>
                <svg aria-hidden viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={on ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
                <span className="max-w-full truncate px-0.5">{label}</span>
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
  const on = matches(usePathname(), href);
  return (
    <Link href={href} aria-current={on ? "page" : undefined}
      className={`flex h-full items-center gap-2 border-b-[3px] px-3 text-sm whitespace-nowrap transition-colors ${on ? "border-amber-400 font-semibold text-zinc-50" : "border-transparent text-zinc-400 hover:text-zinc-100"}`}>{children}</Link>
  );
}
