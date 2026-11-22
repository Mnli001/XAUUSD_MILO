"use client";
import { createContext, useContext, useMemo } from "react";
import { translator, type T } from "@/lib/i18n";
import { DEFAULT_PREFS, type Prefs } from "@/lib/prefs";
import { viewer, type Viewer } from "@/lib/viewer";

const PrefsContext = createContext<Prefs>(DEFAULT_PREFS);

export function PrefsProvider({ prefs, children }: { prefs: Prefs; children: React.ReactNode }) {
  return <PrefsContext.Provider value={prefs}>{children}</PrefsContext.Provider>;
}

export const usePrefs = (): Prefs => useContext(PrefsContext);
export const useT = (): T => translator(useContext(PrefsContext).locale);
export function useViewer(): Viewer {
  const prefs = useContext(PrefsContext);
  return useMemo(() => viewer(prefs), [prefs]);
}
