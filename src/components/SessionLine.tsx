import { sessionLabel } from "@/lib/time";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";

/** The sessions as the rules define them, in Ulaanbaatar hours [from, to). New York runs past midnight. */
export const SESSIONS = [
  { key: "Ази", from: 8, to: 15, color: "var(--color-asia)" }, // i18n-ok: a stored key, shown through its label function
  { key: "Лондон", from: 15, to: 21, color: "var(--color-london)" }, // i18n-ok
  { key: "Нью-Йорк", from: 21, to: 29, color: "var(--color-ny)" }, // i18n-ok
] as const;

export const sessionColor = (s: string) => SESSIONS.find((x) => x.key === s)?.color ?? "var(--color-off)";

const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h + (m || 0) / 60; };
const mod24 = (h: number) => ((h % 24) + 24) % 24;
const pad = (h: number) => String(Math.floor(mod24(h))).padStart(2, "0");

/** Splits [from, to) on a 24-hour ring into pieces that fit on one straight axis. */
function pieces(from: number, to: number): [number, number][] {
  const a = mod24(from), len = to - from;
  return a + len <= 24 ? [[a, a + len]] : [[a, 24], [0, a + len - 24]];
}

/**
 * The day drawn as a line diagram: one true-scale 24-hour axis on the viewer's clock, the three
 * sessions as coloured line segments, scheduled releases as arrivals, and where "now" is.
 */
export function SessionLine({ now, arrivals = [], big = false, v = MN_VIEWER }: { now: Date; arrivals?: { time: Date; label: string }[]; big?: boolean; v?: Viewer }) {
  const { t } = v;
  const shift = hm(v.ub("00:00")); // viewer hour at UB midnight
  const nowH = hm(v.time(now));
  const at = (h: number) => `${(mod24(h) / 24) * 100}%`;
  const current = SESSIONS.find((s) => pieces(s.from + shift, s.to + shift).some(([a, b]) => nowH >= a && nowH < b));

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{t("Өнөөдрийн арилжааны сешнүүд, цагийн тэнхлэг дээр", "Today's trading sessions on a 24-hour axis")}</figcaption>
      <div className={`relative ${big ? "h-20 [--y:2.5rem]" : "h-14 [--y:1.75rem]"}`}>
        {/* the off-hours track the coloured lines run over */}
        <div className="absolute inset-x-0 top-(--y) h-[3px] -translate-y-1/2 rounded-full bg-zinc-800" />
        <div className="draw-line absolute inset-0">
          {/* Time already gone today is drawn muted, like departed trains on a board; what is ahead keeps its full line colour. */}
          {SESSIONS.flatMap((s) => pieces(s.from + shift, s.to + shift).flatMap(([a, b], i) => {
            const cut = Math.min(Math.max(nowH, a), b);
            return ([[a, cut, true], [cut, b, false]] as const).filter(([x, y]) => y > x).map(([x, y, past]) => (
              <div key={`${s.key}${i}${past ? "p" : "f"}`} className={`absolute top-(--y) -translate-y-1/2 rounded-full ${big ? "h-[11px]" : "h-[7px]"}`}
                style={{ left: at(x), width: `${((y - x) / 24) * 100}%`, background: past ? `color-mix(in oklab, ${s.color} 38%, var(--color-zinc-800))` : s.color }} />
            ));
          }))}
          {/* hour stations every three hours */}
          {Array.from({ length: 9 }, (_, i) => i * 3).map((h) => (
            <span key={h} aria-hidden className="absolute top-(--y) h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-950 bg-zinc-600" style={{ left: `${(h / 24) * 100}%` }} />
          ))}
          {arrivals.map((e, i) => (
            <span key={i} title={`${v.time(e.time)} ${e.label}`} className={`absolute flex ${big ? "top-3" : "top-1"}`} style={{ left: at(hm(v.time(e.time))) }}><span className="flex -translate-x-1/2 flex-col items-center">
              <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-amber-400 ring-2 ring-zinc-900" />
              <span className="h-3 w-px bg-amber-400/70" />
            </span></span>
          ))}
        </div>
        <div className="absolute inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-zinc-50" style={{ left: at(nowH) }}>
          <span className="now-pulse absolute top-[calc(var(--y)-0.25rem)] left-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-zinc-50 bg-amber-400" />
        </div>
      </div>
      <div aria-hidden className="relative mt-0.5 h-4 text-[11px] text-zinc-500">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} className={`absolute ${h === 0 ? "" : h === 24 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${(h / 24) * 100}%` }}>{String(h).padStart(2, "0")}</span>
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[12.5px] sm:mt-3 sm:gap-x-5 sm:text-[13px]">
        {SESSIONS.map((s) => (
          <li key={s.key} className={`flex items-center gap-2 ${current === s ? "font-semibold text-zinc-50" : "text-zinc-400"}`}>
            <span className="h-[5px] w-5 rounded-full" style={{ background: s.color }} />
            {sessionLabel(s.key, t)}
            <span className="text-zinc-500 tabular-nums max-sm:hidden">{pad(s.from + shift)}–{pad(s.to + shift)}</span>
          </li>
        ))}
        {arrivals.length > 0 && (
          <li className="flex items-center gap-2 text-zinc-400"><span className="h-2 w-2 rotate-45 rounded-[1px] bg-amber-400" />{t("Мэдээ", "Release")}</li>
        )}
      </ul>
    </figure>
  );
}
