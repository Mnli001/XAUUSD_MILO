import { setLocaleAction } from "@/lib/actions/session";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n";

/** The language list for the pages a visitor sees before signing in; signed-in users also have it in Settings.
 *  A plain disclosure with one submit button per language, so it works before the page's script has loaded. */
export function LanguageSwitch({ locale }: { locale: Locale }) {
  return (
    <details className="group relative text-xs font-medium">
      <summary aria-label="Language" className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 text-zinc-200 hover:border-zinc-500 [&::-webkit-details-marker]:hidden">
        <svg aria-hidden viewBox="0 0 24 24" className="size-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
        </svg>
        <span lang={locale}>{LOCALE_NAMES[locale]}</span>
        <svg aria-hidden viewBox="0 0 24 24" className="size-3.5 text-zinc-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <form action={setLocaleAction} className="absolute end-0 z-50 mt-2 grid w-72 grid-cols-2 gap-0.5 rounded-xl border border-zinc-700 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-md">
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
