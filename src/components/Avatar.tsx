/** A round profile picture, or the name's first letter in gold when there is none. Decorative: the name is always written beside it. */
export function Avatar({ name, src, size = 32, className = "" }: { name: string; src: string | null; size?: number; className?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const box = { width: size, height: size };
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a private, already-small picture behind the session; the optimiser would add nothing
    <img src={src} alt="" aria-hidden width={size} height={size} className={`shrink-0 rounded-full object-cover ring-1 ring-[var(--hairline-gold)] ${className}`} style={box} />
  ) : (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-amber-300 ring-1 ring-[var(--hairline-gold)] ${className}`}
      style={{ ...box, fontSize: Math.max(11, Math.round(size * 0.4)), background: "radial-gradient(circle at 30% 25%, rgb(217 181 102 / 0.32), rgb(217 181 102 / 0.08))" }}>
      {initial}
    </span>
  );
}
