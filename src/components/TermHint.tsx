"use client";
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { glossaryEntry, type GlossaryId } from "@/lib/glossary";
import { useT } from "./PrefsProvider";

const GAP = 8;
const MAX_W = 288;

/**
 * A small "?" beside a trading word. A tap (or click, or Enter) opens a plain explanation; Escape, a tap
 * elsewhere or scrolling closes it. It works on phones, where a hover tooltip never shows. The explanation
 * is drawn on top of the page, so a card that clips its contents cannot cut it off.
 */
export function TermHint({ id, showTerm = false }: { id: GlossaryId; showTerm?: boolean }) {
  const t = useT();
  const e = glossaryEntry(id);
  const term = t(e.term.mn, e.term.en);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const boxId = useId();

  // Place it under the word, inside the screen; above the word if there is no room below.
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = Math.min(MAX_W, window.innerWidth - 2 * GAP);
    const left = Math.min(Math.max(GAP, r.left + r.width / 2 - width / 2), window.innerWidth - width - GAP);
    const h = box.current?.offsetHeight ?? 0;
    const below = r.bottom + GAP;
    const top = below + h > window.innerHeight - GAP && r.top - GAP - h > GAP ? r.top - GAP - h : below;
    setPos({ top, left, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (ev: Event) => { const n = ev.target as Node; if (!btn.current?.contains(n) && !box.current?.contains(n)) setOpen(false); };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const away = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={open ? boxId : undefined}
        aria-label={t(`${term} гэж юу вэ?`, `What is ${term}?`)}
        className={`relative inline-flex shrink-0 items-center gap-1 align-middle text-zinc-400 transition-colors hover:text-amber-300 before:absolute before:-inset-2.5 before:content-[''] ${showTerm ? "rounded-md text-sm font-medium underline decoration-zinc-600 decoration-dotted underline-offset-4" : ""}`}>
        {showTerm && <span>{term}</span>}
        <span aria-hidden className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-current text-[11px] leading-none font-bold">?</span>
      </button>
      {open && createPortal(
        <div ref={box} id={boxId} role="dialog" aria-label={term}
          className="glass-menu fixed z-50 rounded-2xl p-4 text-left text-sm shadow-2xl"
          style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { top: -9999, left: 0, width: MAX_W }}>
          <p className="font-semibold text-zinc-50">{term}</p>
          <p className="mt-1.5 leading-relaxed text-zinc-300">{t(e.def.mn, e.def.en)}</p>
          <Link href={`/glossary#${id}`} className="mt-3 inline-flex min-h-9 items-center text-xs font-semibold text-amber-300 hover:text-amber-200">{t("Бүх нэр томьёо", "All terms")} →</Link>
        </div>,
        document.body,
      )}
    </>
  );
}
