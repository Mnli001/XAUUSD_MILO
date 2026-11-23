import type { Metadata, Viewport } from "next";
import "@fontsource-variable/geologica/full.css";
import "@fontsource/prata/cyrillic-ext-400.css";
import "@fontsource/prata/cyrillic-400.css";
import "@fontsource/prata/latin-400.css";
import "./globals.css";
import { PrefsProvider } from "@/components/PrefsProvider";
import { getPrefs, getT } from "@/lib/prefs.server";

const DARK = "#0b0a09";
const LIGHT = "#f5f1e8";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("XAU Analytics — алтны зах зээлийн шинжилгээ", "XAU Analytics — gold market analysis"),
    description: t("Алтны (XAUUSD) чиглэл, цагийн магадлал, мэдээний календарь, арилжааны журнал.", "Gold (XAUUSD) direction, hourly odds, the news calendar and a trade journal."),
  };
}

export async function generateViewport(): Promise<Viewport> {
  const { theme } = await getPrefs();
  return {
    viewportFit: "cover",
    colorScheme: theme === "system" ? "dark light" : theme,
    themeColor: theme === "system" ? [{ media: "(prefers-color-scheme: light)", color: LIGHT }, { media: "(prefers-color-scheme: dark)", color: DARK }] : theme === "light" ? LIGHT : DARK,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const prefs = await getPrefs();
  return (
    <html lang={prefs.locale} data-theme={prefs.theme}>
      <body className="min-h-dvh bg-zinc-950 text-zinc-100 antialiased">
        <PrefsProvider prefs={prefs}>{children}</PrefsProvider>
      </body>
    </html>
  );
}
