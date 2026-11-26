import Link from "next/link";
import type { Viewer } from "@/lib/viewer";
import type { Section } from "@/lib/legalText";
import { BrandName } from "./BrandMark";
import { LanguageSwitch } from "./LanguageSwitch";
import { Disclaimer } from "./Disclaimer";

/** A legal page: plain, readable prose, with the operator, contact and version filled in. */
export function LegalDoc({ v, doc, fill }: { v: Viewer; doc: { title: string; lede: string; sections: Section[] }; fill: Record<string, string> }) {
  const sub = (s: string) => s.replace(/\{(\w+)\}/g, (m, k: string) => fill[k] ?? m);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-6 sm:px-6">
        <Link href="/" aria-label="XAU Analytics"><BrandName /></Link>
        <LanguageSwitch locale={v.locale} />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="page-title">{doc.title}</h1>
        <p className="page-lede mt-3">{doc.lede}</p>
        <div className="mt-8 space-y-7">
          {doc.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-lg font-semibold text-zinc-100">{s.h}</h2>
              {s.p.length === 1
                ? <p className="mt-2 max-w-prose leading-relaxed text-zinc-300">{sub(s.p[0])}</p>
                : <ul className="mt-2 max-w-prose list-disc space-y-2 pl-5 leading-relaxed text-zinc-300 marker:text-zinc-600">{s.p.map((x) => <li key={x}>{sub(x)}</li>)}</ul>}
            </section>
          ))}
        </div>
      </main>
      <Disclaimer v={v} />
    </div>
  );
}
