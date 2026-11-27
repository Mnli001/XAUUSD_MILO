"use client";
import { createContext, useContext, useMemo } from "react";
import { registerCatalog, translator, type Catalog, type T } from "@/lib/i18n";
import { DEFAULT_PREFS, type Prefs } from "@/lib/prefs";
import { viewer, type Viewer } from "@/lib/viewer";

const PrefsContext = createContext<Prefs>(DEFAULT_PREFS);

/** `catalog`: the reader's translation file (none for Mongolian and English), made available before anything below reads it. */
export function PrefsProvider({ prefs, catalog = null, children }: { prefs: Prefs; catalog?: Catalog | null; children: React.ReactNode }) {
  if (catalog) registerCatalog(prefs.locale, catalog);
  return <PrefsContext.Provider value={prefs}>{children}</PrefsContext.Provider>;
}

export const usePrefs = (): Prefs => useContext(PrefsContext);
export const useT = (): T => translator(useContext(PrefsContext).locale);
export function useViewer(): Viewer {
  const prefs = useContext(PrefsContext);
  return useMemo(() => viewer(prefs), [prefs]);
}
