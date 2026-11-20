import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "XAU Analytics — алтны зах зээлийн шинжилгээ",
  description: "Алтны (XAUUSD) чиглэл, цагийн магадлал, мэдээний календарь, арилжааны журнал.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
