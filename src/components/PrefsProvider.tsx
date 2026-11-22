"use client";
import { createContext, useContext } from "react";
import { translator, type T } from "@/lib/i18n";
import { DEFAULT_PREFS, type Prefs } from "@/lib/prefs";

const PrefsContext = createContext<Prefs>(DEFAULT_PREFS);

export function PrefsProvider({ prefs, children }: { prefs: Prefs; children: React.ReactNode }) {
  return <PrefsContext.Provider value={prefs}>{children}</PrefsContext.Provider>;
}

export const usePrefs = (): Prefs => useContext(PrefsContext);
export const useT = (): T => translator(useContext(PrefsContext).locale);
