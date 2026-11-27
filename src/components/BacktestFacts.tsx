import Link from "next/link";
import type { T } from "@/lib/i18n";
import { CURVES, HERO_RISK, finalBalance, riskCurve, rrLabel, rrRange, signedPct, signedR, spanLabel, usd, type BacktestCurves } from "@/lib/backtestCurves";
import { Dir } from "./Timetable";

/** The backtest file, with the optional description fields a newer export adds (scripts/export-equity-curves.ts). */
type Model = { positionCap?: number; swapPerOzNight?: number; newsFilterFrom?: string; dataGap?: [string, string]; excluded?: string[] } & Record<string, unknown>;
type Curves = BacktestCurves & { model?: unknown; assumptions?: unknown; outOfSample?: { note?: string; year2023R?: number } };

/** A value from the file as words: strings as they are, { mn, en } in the reader's language, lists and objects joined. */
export function metaText(x: unknown, t: T): string {
  if (x === null || x === undefined || x === "") return "";
  if (typeof x === "string") return x;
  if (typeof x === "number") return String(x);
  if (typeof x === "boolean") return x ? t("тийм", "yes") : t("үгүй", "no");
  if (Array.isArray(x)) return x.map((v) => metaText(v, t)).filter(Boolean).join(", ");
  if (typeof x === "object") {
    const o = x as Record<string, unknown>;
    if (typeof o.mn === "string" && typeof o.en === "string") return t(o.mn, o.en);
    return Object.entries(o).map(([k, v]) => `${k}: ${metaText(v, t)}`).join(" · ");
  }
  return "";
}

/** The costs the export says it leaves out, named in the reader's language where the wording is known. */
const excludedName = (x: string, t: T) =>
  /commission/i.test(x) ? t("шимтгэл", "commission") : /slippage/i.test(x) ? t("slippage", "slippage") : /spread/i.test(x) ? t("мэдээний үеийн өргөн spread", "wider spread at news") : x;

/** The model the export describes, as short clauses: what it includes and what it leaves out. */
export function modelClauses(m: unknown, t: T): string[] {
  if (!m || typeof m !== "object" || Array.isArray(m)) return m ? [metaText(m, t)] : [];
  const o = m as Model;
  const known = new Set(["positionCap", "swapPerOzNight", "newsFilterFrom", "dataGap", "excluded"]);
  const out: string[] = [];
  const incl = [
    typeof o.positionCap === "number" ? t(`нэг дор ${o.positionCap} позиц хүртэл`, `up to ${o.positionCap} positions at once`) : "",
    typeof o.swapPerOzNight === "number" ? t(`swap $${o.swapPerOzNight}/унц/шөнө`, `swap $${o.swapPerOzNight}/oz a night`) : "",
  ].filter(Boolean);
  if (incl.length) out.push(t(`тооцсон: ${incl.join(", ")}`, `modelled: ${incl.join(", ")}`));
  if (o.newsFilterFrom) out.push(t(`мэдээний шүүлтүүр зөвхөн ${o.newsFilterFrom}-өөс (түүнээс өмнөх мэдээний түүх алга)`, `news filter only from ${o.newsFilterFrom} (no news history before)`));
  if (Array.isArray(o.dataGap) && o.dataGap.length === 2) out.push(t(`${o.dataGap[0]} → ${o.dataGap[1]} (2020 оны COVID-ийн хэсэг) дата алга`, `no data ${o.dataGap[0]} → ${o.dataGap[1]} (the 2020 COVID stretch)`));
  if (Array.isArray(o.excluded) && o.excluded.length) { const ex = o.excluded.map((x) => excludedName(String(x), t)).join(", "); out.push(t(`тооцоогүй: ${ex}`, `not modelled: ${ex}`)); }
  for (const [k, v] of Object.entries(o)) if (!known.has(k)) out.push(`${k}: ${metaText(v, t)}`);
  return out;
}

/**
 * What the backtest is and how it differs from the live system, said next to every profit figure in the same type as
 * its subline. A file that states its own model is quoted from that model; an older one gets the default differences.
 */
export function honestyText(t: T, c: Curves = CURVES): string {
  const clauses = [...modelClauses(c.model, t), metaText(c.assumptions, t)].filter(Boolean);
  if (!clauses.length) {
    return t(
      "Түүхэн датан дээрх backtest · live системээс ялгаатай: мэдээний шүүлтүүр, 2020 оны COVID-ийн хэсэг, swap тооцоогүй · forward шалгагдаагүй",
      "Backtest on historical data · differs from the live system: news filter, the 2020 COVID stretch and swap not modelled · not forward-tested",
    );
  }
  const covid = /covid|2020/i.test(clauses.join(" ")) ? [] : [t("2020 оны COVID-ийн хэсэг датанд алга", "the 2020 COVID stretch is missing from the data")];
  return [t("Түүхэн датан дээрх backtest", "Backtest on historical data"), ...clauses, ...covid, t("forward шалгагдаагүй", "not forward-tested")].join(" · ");
}

/**
 * Which part of the history the rules were chosen on and which part judged them, and what the judged part did. Read
 * from the file's outOfSample block and its years; null for a file without that block.
 */
export function outOfSampleText(t: T, c: Curves = CURVES): string | null {
  const o = c.outOfSample;
  if (!o) return null;
  const y23 = c.years.find((y) => y.year === 2023);
  const r23 = typeof o.year2023R === "number" ? o.year2023R : y23?.r;
  const total = c.years.reduce((s, y) => s + y.r, 0);
  const late = c.years.filter((y) => y.year >= 2024).reduce((s, y) => s + y.r, 0);
  const share = total > 0 ? Math.round((late / total) * 100) : null;
  const lastYear = c.years.at(-1)?.year;
  return t(
    `Дүрэм, тохиргоог 2019–2022 оны датан дээр сонгож, 2023 оноос хойш шалгасан.${r23 !== undefined ? (r23 < 0 ? ` 2023 он өөрөө ${signedR(r23, 2)}-ээр алдагдалтай.` : ` 2023 он ${signedR(r23, 2)}.`) : ""}${share !== null && lastYear ? ` Нийт R-ийн ${share}% нь 2024–${lastYear} оноос.` : ""}`,
    `The rules and settings were chosen on 2019–2022 and checked on 2023 onward.${r23 !== undefined ? (r23 < 0 ? ` 2023 itself lost ${signedR(-r23, 2).replace("+", "")}.` : ` 2023 made ${signedR(r23, 2)}.`) : ""}${share !== null && lastYear ? ` ${share}% of all R comes from 2024–${lastYear}.` : ""}`,
  );
}

/** The honesty line itself, sized to sit under a headline figure as its equal. */
export function BacktestHonesty({ t, c = CURVES, size = "lg", className = "" }: { t: T; c?: Curves; size?: "lg" | "sm"; className?: string }) {
  return (
    <span className={`flex items-start gap-2 text-zinc-300 ${size === "lg" ? "text-base sm:text-lg" : "text-sm"} ${className}`} data-testid="backtest-honesty">
      <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full border border-amber-400/70" />
      <span className="min-w-0">{honestyText(t, c)}</span>
    </span>
  );
}

/** The one line every backtest figure carries: what it is, where from, and that the past is not a promise. */
export function BacktestNote({ t, c = CURVES, className = "" }: { t: T; c?: BacktestCurves; className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-zinc-500 ${className}`}>
      <span className="font-semibold text-zinc-400">{t("Түүхэн датан дээрх туршилт (backtest)", "A test on historical data (backtest)")}</span>
      {" · "}{t(`MT5 брокерын XAUUSD ${spanLabel(c)}, spread $${c.spread.toFixed(2)}, хаагдсан арилжаагаар. Өнгөрсөн үр дүн ирээдүйн ашгийг баталгаажуулахгүй.`, `MT5 broker XAUUSD ${spanLabel(c)}, $${c.spread.toFixed(2)} spread, on closed trades. Past results do not guarantee future profit.`)}
    </p>
  );
}

/** R won or lost in each calendar year, as bars around a zero rule. The sign is printed, not only coloured. */
export function YearBars({ t, c = CURVES }: { t: T; c?: BacktestCurves }) {
  // Zero sits where it leaves room for the deepest losing year on the left and the best year on the right.
  const neg = Math.max(0, ...c.years.map((y) => -y.r)), pos = Math.max(0, ...c.years.map((y) => y.r));
  const span = neg + pos || 1;
  const zero = (neg / span) * 100;
  return (
    <ul className="space-y-3" aria-label={t("Жил бүрийн үр дүн, R-ээр", "Result by year, in R")}>
      {c.years.map((y) => {
        const up = y.r >= 0;
        const thin = y.trades < 20;
        const losing = !up && !thin;
        return (
          <li key={y.year} data-losing={losing || undefined} className={`grid grid-cols-[3rem_minmax(0,1fr)_5.5rem] items-center gap-x-3 gap-y-1 rounded-xl text-sm ${losing ? "-mx-2 px-2 py-1.5" : ""}`}
            style={losing ? { background: "color-mix(in oklab, var(--color-red-400) 9%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-red-400) 28%, transparent)" } : undefined}>
            <span className="font-semibold text-zinc-300 tabular-nums">{y.year}</span>
            <span className="relative h-6" aria-hidden>
              <span className="absolute inset-y-0 w-px" style={{ left: `${zero}%`, background: "var(--color-zinc-600)" }} />
              <span
                className={`absolute inset-y-1 ${up ? "rounded-r-md bg-amber-400/80" : "rounded-l-md bg-red-400/80"}`}
                style={{ [up ? "left" : "right"]: up ? `${zero}%` : `${100 - zero}%`, width: `${(Math.abs(y.r) / span) * 100}%`, minWidth: 4 }}
              />
            </span>
            <span className={`text-right font-semibold tabular-nums ${up ? "text-zinc-50" : "text-red-300"}`}>
              <Dir d={up ? 1 : -1} className="mr-1" />{signedR(y.r, 2)}
            </span>
            <span className="col-span-3 pl-[3.75rem] text-xs text-zinc-500 tabular-nums">
              {thin
                ? t(`${y.trades} арилжаа · өгөгдөл дутуу жил`, `${y.trades} trades · a year with missing data`)
                : t(`${y.trades} арилжаа · ${Math.round(y.winRate)}% ашигтай${y.year === Number(c.generatedAt.slice(0, 4)) ? " · он дуусаагүй" : ""}`, `${y.trades} trades · ${Math.round(y.winRate)}% in profit${y.year === Number(c.generatedAt.slice(0, 4)) ? " · year not over" : ""}`)}
              {losing && <strong className="ml-1.5 font-semibold text-red-300">· {t("алдагдалтай жил", "a losing year")}</strong>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Four facts about how the system trades, the same at every risk. */
export function KeyStats({ t, c = CURVES }: { t: T; c?: BacktestCurves }) {
  const s = c.stats;
  const [lo, hi] = rrRange();
  const items: [string, string, string][] = [
    [t("Долоо хоногт", "Trades a week"), `~${s.perWeek.toFixed(1)}`, t(`нийт ${s.trades} арилжаа`, `${s.trades} trades in all`)],
    [t("Ашигтай арилжаа", "Trades in profit"), `${(Math.round(s.winRate * 10 + 1e-6) / 10).toFixed(1)}%`, t("бараг тал нь", "about half")],
    ["R:R", rrLabel(), t(`target нь stop-оос ${lo}–${hi} дахин хол`, `targets ${lo}–${hi}× the stop`)],
    ["Profit factor", s.profitFactor.toFixed(2), t(`дунджаар +${s.avgR.toFixed(2)}R / арилжаа`, `+${s.avgR.toFixed(2)}R a trade on average`)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3">
      {items.map(([label, value, sub]) => (
        <div key={label} className="glass-inset p-4 sm:p-5">
          <dt className="text-xs font-semibold text-zinc-400">{label}</dt>
          <dd className="font-display mt-1.5 text-[28px] leading-none whitespace-nowrap text-zinc-50 tabular-nums sm:text-[32px]">{value}</dd>
          <dd className="mt-1.5 text-xs text-zinc-500">{sub}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The headline proof: "$1,500 → $6,494 · 2019–2026 · 1.5% risk", with the drawdown it took to get there and, in the
 * same type, what kind of number it is. The figure never stands alone.
 */
export function ProofLine({ t, c = CURVES, risk = HERO_RISK, size = "lg" }: { t: T; c?: Curves; risk?: number; size?: "lg" | "sm" }) {
  const r = riskCurve(risk, c);
  const big = size === "lg";
  return (
    <p className="min-w-0">
      <span className={`font-display block leading-none text-zinc-50 tabular-nums ${big ? "text-[clamp(2.2rem,7vw,3.4rem)]" : "text-[30px] sm:text-[36px]"}`}>
        {usd(c.start)} <span aria-hidden className="text-amber-400">→</span><span className="sr-only">{t("-аас", "to")}</span> <span className="gold-text">{usd(finalBalance(r))}</span>
      </span>
      <span className={`mt-2 block text-zinc-300 tabular-nums ${big ? "text-base sm:text-lg" : "text-sm"}`}>
        {t(`${spanLabel(c)} · арилжаа бүрт ${r.risk}% эрсдэлтэй · ${signedPct(r.finalPct, 0)} · хамгийн их уналт −${r.maxDD.toFixed(1)}%`, `${spanLabel(c)} · ${r.risk}% risk per trade · ${signedPct(r.finalPct, 0)} · largest fall −${r.maxDD.toFixed(1)}%`)}
      </span>
      <BacktestHonesty t={t} c={c} size={size} className="mt-1.5" />
    </p>
  );
}

/** Every risk on one line each: what it made and the fall it took. For the plans page. */
export function RiskLadder({ t, c = CURVES }: { t: T; c?: BacktestCurves }) {
  return (
    <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-5" aria-label={t("Эрсдэл бүрийн үр дүн", "Result at each risk")}>
      {c.risks.map((r) => (
        <li key={r.risk} className={`glass-inset px-3 py-2.5 text-sm ${r.risk === HERO_RISK ? "glass-tile-on" : ""}`}>
          <span className="block text-xs font-semibold text-zinc-400">{t(`${r.risk}% эрсдэл`, `${r.risk}% risk`)}</span>
          <span className="block font-semibold text-zinc-50 tabular-nums">{usd(finalBalance(r))} <span className="text-amber-300">{signedPct(r.finalPct, 0)}</span></span>
          <span className="block text-xs text-red-300 tabular-nums">{t(`уналт −${r.maxDD.toFixed(1)}%`, `fall −${r.maxDD.toFixed(1)}%`)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * What the research threw away, so the rule that is left is read against it. Facts from PRODUCT.md, README and
 * docs/SYSTEM_SPEC.md §7; no figure here is not in those documents.
 */
export const rejectedIdeas = (t: T): [string, string][] => [
  [t("19 дүрэм (2026-11-20 судалгаа)", "19 rules (the 2026-11-20 study)"), t("Аль нь ч урьдчилан тогтоосон шалгуурыг даваагүй.", "Not one passed the criteria set in advance.")],
  [t("Лондоны breakout", "London breakout"), t("Хоёр хугацаанд хоёуланд нь тогтвортой биш тул хассан.", "Dropped: it did not hold up in both periods.")],
  [t("Өдрийн цагийн эргэлт (reversion)", "Daytime reversion"), t("Хоёр хугацаанд хоёуланд нь тогтвортой биш тул хассан.", "Dropped: it did not hold up in both periods.")],
  [t("4 цагийн swing арилжаа", "H4 swing trades"), t("Хоёр хугацаанд хоёуланд нь тогтвортой биш тул хассан.", "Dropped: it did not hold up in both periods.")],
  [t("Breakeven (+1R, +1.5R), хагасыг нь +1.5R-д хаах", "Breakeven (+1R, +1.5R), half off at +1.5R"), t("2019–2022 болон 2023 оноос хойш хоёуланд нь муу.", "Worse in 2019–2022 and in 2023 on, both.")],
  [t("Limit pullback оролт", "Limit pullback entries"), t("2019–2022 онд алдагдалтай, уналт 30R хүртэл.", "Lost money in 2019–2022, falls up to 30R.")],
  [t("Нью-Йоркийг АНУ-ын зун/өвлийн цагаар", "New York on US daylight time"), t("NY-ийн 2 дахь цагийг 2019–2022 онд алдагдалд оруулсан.", "Turned the New York late hour into a loss in 2019–2022.")],
  [t("Мэдээний өмнө breakeven эсвэл хаах", "Breakeven or close before news"), t("Муу. Мэдээний үеэр огт орохгүй дүрэм нь зөв гэдэг батлагдсан.", "Worse. Not entering around news at all held up.")],
];

/** "What we tested and threw away": a compact list, struck through, with the one rule for what stayed. */
export function RejectedIdeas({ t, id = "rejected", headingLevel = 2, className = "" }: { t: T; id?: string; headingLevel?: 2 | 3; className?: string }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <section id={id} className={`scroll-mt-24 ${className}`} aria-labelledby={`${id}-h`}>
      <p className="text-xs font-bold tracking-[0.14em] text-amber-400 uppercase">{t("Нээлттэй судалгаа", "Open research")}</p>
      <H id={`${id}-h`} className={`font-display mt-3 leading-[1.08] text-zinc-50 ${headingLevel === 2 ? "text-[30px] sm:text-[40px]" : "text-[24px] sm:text-[28px]"}`}>{t("Бид юуг туршаад хаясан бэ", "What we tested and threw away")}</H>
      <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-zinc-400">
        {t("Нэг санаа 2019–2022 болон 2023 оноос хойшх хоёр хугацаанд хоёуланд нь дундаж R эсвэл profit factor-ыг сайжруулж, долоо хоногт 1-ээс доошгүй арилжаа үлдээж, уналтыг мэдэгдэхүйц өсгөхгүй байж л үлддэг. Ихэнх нь унасан.",
          "An idea stays only if it improves the average R or profit factor in both 2019–2022 and 2023 on, keeps at least one trade a week and does not deepen the falls noticeably. Most failed.")}
      </p>
      <ul className="mt-6 grid gap-x-8 gap-y-0 sm:grid-cols-2">
        {rejectedIdeas(t).map(([name, why]) => (
          <li key={name} className="flex gap-3 border-t py-3.5" style={{ borderColor: "var(--hairline)" }}>
            <span aria-hidden className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[12px] leading-none text-zinc-500" style={{ borderColor: "var(--hairline)" }}>×</span>
            <span className="min-w-0">
              <span className="block font-semibold text-zinc-200 line-through decoration-zinc-500/70 decoration-1">{name}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-zinc-400">{why}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex gap-3 rounded-2xl border px-4 py-3.5 text-sm leading-relaxed text-zinc-200" style={{ borderColor: "var(--hairline-gold)" }}>
        <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
        <span>{t("Үлдсэн нь: Ази, Нью-Йоркийн нээлт, Нью-Йоркийн 2 дахь цаг гэсэн 3 сешний хүрээний breakout, өдөр ба 4 цагийн trend-тэй нэг чиглэлд л. Хоёр хугацаанд хоёуланд нь тэссэн цорын ганц хэлбэр.",
          "What stayed: the range breakout of 3 sessions (Asia, New York open, New York's second hour), only with the daily and 4-hour trends. The one shape that held up in both periods.")}</span>
      </p>
    </section>
  );
}

/** A one-line link to the list of rejected ideas. */
export function RejectedLink({ t, href = "#rejected" }: { t: T; href?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-amber-300 underline decoration-amber-400/40 underline-offset-4 hover:text-amber-200">
      {t("Бид юуг туршаад хаясан бэ", "What we tested and threw away")} <span aria-hidden>→</span>
    </Link>
  );
}
