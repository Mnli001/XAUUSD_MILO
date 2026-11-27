"use client";
import { useEffect, useRef } from "react";
import { setLocaleAction } from "@/lib/actions/session";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n";

/** The translate glyph: an "A" beside a character, the sign people look for to change language. */
function LanguageIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" />
    </svg>
  );
}

/** The language list: a disclosure with one submit button per language, so it works before the page's script has loaded.
 *  Once the script runs it also closes on a click outside, on Escape, and after a choice.
 *  `iconOnly` is the compact button for the dashboard's top-right corner; otherwise the current language is named. */
export function LanguageSwitch({ locale, iconOnly = false }: { locale: Locale; iconOnly?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = () => { if (ref.current) ref.current.open = false; };
    const onPointer = (e: PointerEvent) => { if (ref.current?.open && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && ref.current?.open) { close(); ref.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, []);

  return (
    <details ref={ref} className="group relative text-xs font-medium">
      <summary aria-label="Language" title={`Language · ${LOCALE_NAMES[locale]}`}
        className={`flex cursor-pointer list-none items-center rounded-lg border border-zinc-700 text-zinc-200 hover:border-zinc-500 group-open:border-zinc-500 [&::-webkit-details-marker]:hidden ${iconOnly ? "size-10 justify-center" : "min-h-9 gap-1.5 px-2.5"}`}>
        {iconOnly ? <LanguageIcon className="size-5 text-zinc-300" /> : (
          <>
            <svg aria-hidden viewBox="0 0 24 24" className="size-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
            </svg>
            <span lang={locale}>{LOCALE_NAMES[locale]}</span>
            <svg aria-hidden viewBox="0 0 24 24" className="size-3.5 text-zinc-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
          </>
        )}
      </summary>
      <form action={setLocaleAction} onSubmit={() => { if (ref.current) ref.current.open = false; }}
        className="absolute end-0 z-50 mt-2 grid w-72 max-w-[calc(100vw-2rem)] grid-cols-2 gap-0.5 rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-2xl">
        {LOCALES.map((l) => (
          <button key={l} name="locale" value={l} aria-pressed={locale === l} lang={l} dir="auto"
            className={`min-h-9 rounded-lg px-2.5 text-start text-sm ${locale === l ? "bg-zinc-800 text-zinc-50" : "text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-50"}`}>
            {LOCALE_NAMES[l]}
          </button>
        ))}
      </form>
    </details>
  );
}
