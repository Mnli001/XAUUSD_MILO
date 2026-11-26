"use client";
import { useEffect } from "react";
import "./globals.css";

/** Both languages: this replaces the root layout, so the visitor's language setting is not known here. */
const COPY = {
  title: { mn: "Алдаа гарлаа", en: "Something went wrong" },
  body: { mn: "Сайтыг ачаалах үед алдаа гарлаа. Дахин оролдоно уу; давтагдвал админд хэлээрэй.", en: "The site failed to load. Try again; if it keeps happening, tell the admin." },
  retry: { mn: "Дахин оролдох", en: "Try again" },
};

/** The last resort when the root layout itself fails. It brings its own <html>, <body> and styles. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <html lang="mn" data-theme="dark">
      <body className="min-h-dvh bg-zinc-950 text-zinc-100 antialiased">
        <title>XAU Analytics</title>
        <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12 text-center">
          <p className="font-display text-[19px] text-zinc-50">XAU <span className="gold-text">Analytics</span></p>
          <section className="card mt-8 w-full max-w-md sm:p-8">
            <p className="font-display text-5xl text-amber-400" aria-hidden>500</p>
            <h1 className="mt-3 text-xl font-semibold text-zinc-50">{COPY.title.mn}<span className="mt-1 block text-base font-normal text-zinc-400" lang="en">{COPY.title.en}</span></h1>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{COPY.body.mn}</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500" lang="en">{COPY.body.en}</p>
            <button type="button" className="btn mt-6" onClick={() => retry()}>{COPY.retry.mn} · <span lang="en">{COPY.retry.en}</span></button>
          </section>
        </main>
      </body>
    </html>
  );
}
