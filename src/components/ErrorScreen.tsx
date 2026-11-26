import type { ReactNode } from "react";
import Link from "next/link";
import { BrandName } from "./BrandMark";

/** The branded frame for "not found" and "something broke": the mark, a code, what happened, and where to go. */
export function ErrorScreen({ code, title, body, actions, full = true }: { code: string; title: string; body: string; actions: ReactNode; full?: boolean }) {
  return (
    <main className={`flex flex-col items-center justify-center px-4 py-12 text-center ${full ? "min-h-dvh" : "min-h-[60vh]"}`}>
      {full && <Link href="/" aria-label="XAU Analytics" className="mb-8"><BrandName /></Link>}
      <section className="card w-full max-w-md sm:p-8" aria-labelledby="error-h">
        <p className="font-display text-5xl text-amber-400 tabular-nums" aria-hidden>{code}</p>
        <h1 id="error-h" className="mt-3 text-xl font-semibold text-zinc-50">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>
      </section>
    </main>
  );
}
