import type { ReactNode } from "react";
import Link from "next/link";

/*
 * Small pieces of the departure-timetable vocabulary shared by the journal, performance, bot and
 * admin pages: a side pill, a signed money figure, a station dot and a ruled row of figures.
 */

/** Money with its sign always written out: +$12.30, −$4.00, $0.00. */
export const signedUsd = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Up, down or flat: the colour that travels with a sign or arrow. */
export const toneOf = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? "text-zinc-200" : v > 0 ? "text-emerald-400" : "text-red-400");

/**
 * The direction mark: a drawn triangle (up / down) or a dot (flat), sized to the cap height of the
 * text it sits in and coloured by it. Decorative; the word or sign beside it carries the meaning.
 */
export function Dir({ d, className = "" }: { d: number; className?: string }) {
  if (d === 0) return <svg aria-hidden viewBox="0 0 10 10" className={`inline-block h-[0.55em] w-[0.55em] align-[0.05em] ${className}`}><circle cx="5" cy="5" r="4" fill="currentColor" /></svg>;
  return (
    <svg aria-hidden viewBox="0 0 10 9" className={`inline-block h-[0.62em] w-[0.7em] align-[0.02em] ${className}`}>
      <path d={d > 0 ? "M5 0.6 9.6 8.4H0.4Z" : "M5 8.4 0.4 0.6h9.2Z"} fill="currentColor" strokeLinejoin="round" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  );
}

/** BUY / SELL as a pill: arrow, word and colour together. */
export function SidePill({ side, label }: { side: string; label?: string }) {
  const buy = side === "BUY";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold tracking-wide whitespace-nowrap ${buy ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
      <Dir d={buy ? 1 : -1} />{label ?? side}
    </span>
  );
}

/** A signed P&L figure, right-aligned by its container. */
export function Pnl({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`font-semibold tabular-nums whitespace-nowrap ${toneOf(value)} ${className}`}>{signedUsd(value)}</span>;
}

/** A 13px station: filled when it is the live one, hollow otherwise. */
export function Station({ tone = "off", className = "" }: { tone?: "on" | "now" | "off" | "warn" | "down"; className?: string }) {
  const cls = {
    on: "border-emerald-400 bg-emerald-400",
    now: "border-zinc-50 bg-amber-400",
    off: "border-zinc-600 bg-zinc-900",
    warn: "border-amber-400 bg-zinc-900",
    down: "border-red-400 bg-zinc-900",
  }[tone];
  return <span aria-hidden className={`inline-block h-[13px] w-[13px] shrink-0 rounded-full border-[3px] ${cls} ${className}`} />;
}

/** The way back to the parent page, above a page title. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="-ml-1 inline-flex min-h-11 items-center gap-1 pr-2 text-sm text-zinc-400 hover:text-zinc-100 sm:min-h-8">
      <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3"><path d="M7.5 2.5 4 6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {children}
    </Link>
  );
}

export type Figure ={ label: string; value: ReactNode; tone?: string; note?: ReactNode };

/** A compact ruled board of figures: one plate, cells divided by fine rules, numbers tabular. */
export function Figures({ items, className = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6", label, inset = false }: { items: Figure[]; className?: string; label?: string; inset?: boolean }) {
  // Pick a column count that divides the number of figures, or the empty cells show as a block.
  return (
    <dl aria-label={label} className={`grid gap-px overflow-hidden border ${inset ? "rounded-[16px]" : "rounded-[20px]"} ${className}`} style={{ borderColor: "var(--hairline)", background: "var(--hairline)", boxShadow: inset ? undefined : "var(--shadow-panel)" }}>
      {items.map((f) => (
        <div key={f.label} className={`min-w-0 ${inset ? "px-3 py-2.5" : "px-4 py-3"}`} style={{ background: "var(--cell-bg)" }}>
          <dt className="text-xs leading-snug break-words text-zinc-500">{f.label}</dt>
          {/* A long figure shrinks and wraps; it is never cut off. */}
          <dd className={`mt-0.5 text-[clamp(0.8rem,3.9vw,1.125rem)] leading-tight font-semibold break-words tabular-nums ${f.tone ?? "text-zinc-50"}`}>{f.value}</dd>
          {f.note && <dd className="mt-0.5 text-xs leading-snug break-words text-zinc-500">{f.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
