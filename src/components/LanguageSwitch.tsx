import { setLocaleAction } from "@/lib/actions/session";
import type { Locale } from "@/lib/i18n";

/** MN | EN, for the pages a visitor sees before signing in. Signed-in users also have it in Settings. */
export function LanguageSwitch({ locale }: { locale: Locale }) {
  return (
    <form action={setLocaleAction} className="inline-flex overflow-hidden rounded-lg border border-zinc-700 text-xs font-medium" aria-label="Language">
      {(["mn", "en"] as const).map((l) => (
        <button key={l} name="locale" value={l} aria-pressed={locale === l} lang={l}
          className={`min-h-9 px-2.5 uppercase ${locale === l ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200"}`}>{l}</button>
      ))}
    </form>
  );
}
