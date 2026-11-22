import type { Metadata, Viewport } from "next";
import "@fontsource-variable/golos-text";
import "./globals.css";

export const metadata: Metadata = {
  title: "XAU Analytics — алтны зах зээлийн шинжилгээ",
  description: "Алтны (XAUUSD) чиглэл, цагийн магадлал, мэдээний календарь, арилжааны журнал.",
};

export const viewport: Viewport = { themeColor: "#0d0c09", viewportFit: "cover", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn">
      <body className="min-h-dvh bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
