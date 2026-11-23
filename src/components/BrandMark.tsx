/** The brand mark: a faceted gold ingot seen end-on, drawn as three planes. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 28 28" className={`h-7 w-7 shrink-0 ${className}`}>
      <path d="M8 6h12l6 16H2z" fill="#d9b566" />
      <path d="M8 6h12l-2.2 4.2h-7.6z" fill="#f6e4b4" />
      <path d="M10.2 10.2h7.6L26 22H2z" fill="#c29b4c" />
      <path d="M17.8 10.2 20 6l6 16z" fill="#9c7a35" />
    </svg>
  );
}

export function BrandName() {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark />
      <span className="font-display text-[19px] leading-none whitespace-nowrap text-zinc-50">XAU <span className="gold-text">Analytics</span></span>
    </span>
  );
}
