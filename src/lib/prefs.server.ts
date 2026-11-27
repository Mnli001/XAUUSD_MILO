import { cache } from "react";
import { cookies, headers } from "next/headers";
import "./i18n.server";
import { getSessionUser } from "./auth";
import { localeFromAcceptLanguage, translator, type T } from "./i18n";
import { COOKIE, parseLocale, parseTheme, parseTimeZone, type Prefs } from "./prefs";
import { prefsOf } from "./prefsDb";
import { viewer, type Viewer } from "./viewer";

const YEAR = 60 * 60 * 24 * 365;

/** The signed-in user's saved settings; for a visitor, what their browser remembers. */
export const getPrefs = cache(async (): Promise<Prefs> => {
  const user = await getSessionUser();
  if (user) return prefsOf(user);
  const c = await cookies();
  const saved = c.get(COOKIE.locale)?.value;
  // A first visit reads in the browser's own language; once chosen, the choice is kept in the cookie.
  const locale = saved ? parseLocale(saved) : localeFromAcceptLanguage((await headers()).get("accept-language"));
  return { locale, theme: parseTheme(c.get(COOKIE.theme)?.value), timeZone: parseTimeZone(c.get(COOKIE.timeZone)?.value) };
});

export async function getT(): Promise<T> {
  return translator((await getPrefs()).locale);
}

/** Keeps the settings in the browser too, so the pages seen while signed out match. Only from an action or a route. */
export async function rememberPrefs(p: Partial<Prefs>): Promise<void> {
  const c = await cookies();
  const opts = { path: "/", maxAge: YEAR, sameSite: "lax" as const };
  if (p.locale) c.set(COOKIE.locale, p.locale, opts);
  if (p.theme) c.set(COOKIE.theme, p.theme, opts);
  if (p.timeZone) c.set(COOKIE.timeZone, p.timeZone, opts);
}

export const getViewer = cache(async (): Promise<Viewer> => viewer(await getPrefs()));
