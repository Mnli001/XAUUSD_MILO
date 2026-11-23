import type { TodaySnapshot } from "@/lib/snapshot";
import type { Timeframe } from "@/lib/analysis/indicators";
import { biasLabelText } from "@/lib/analysis/bias";
import type { T } from "@/lib/i18n";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";
import { Dir } from "./Timetable";
import { PriceSpark } from "./PriceSpark";
import { LivePrice } from "./LiveQuote";

export const loadingText = (t: T) => t("Дата ачаалж байна", "Loading data");
const tfLabels = (t: T): [Timeframe, string][] => [["1day", t("Өдөр", "Day")], ["4h", t("4ц", "4h")], ["1h", t("1ц", "1h")], ["15min", t("15м", "15m")]];
const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n))}`;

export function Empty({ title, v = MN_VIEWER }: { title: string; v?: Viewer }) {
  return (
    <div className="card">
      <h2 className="card-title">{title}</h2>
      <p className="flex items-center gap-2 text-sm text-zinc-500"><span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />{loadingText(v.t)}</p>
    </div>
  );
}

/** Price, change and freshness: the line above the day diagram. */
export function PriceHeader({ price, date, closes = [], v = MN_VIEWER }: Pick<TodaySnapshot, "price"> & { date?: string; closes?: number[]; v?: Viewer }) {
  const { t } = v;
  if (!price) return <p className="text-sm text-zinc-500">XAUUSD · {loadingText(t)}</p>;
  const hi = closes.length ? Math.max(...closes) : null, lo = closes.length ? Math.min(...closes) : null;
  return (
    <div className="grid items-end gap-x-10 gap-y-4 md:grid-cols-[auto_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-zinc-400">
          <span className="font-semibold tracking-[0.08em] text-amber-400">XAUUSD</span>
          {date && <span>{date}</span>}
        </p>
        <LivePrice last={price.last} prevClose={price.changePct !== null ? price.last / (1 + price.changePct / 100) : null} updatedAt={price.updatedAt.toISOString()} />
      </div>
      {closes.length >= 8 && (
        <div className="min-w-0">
          <PriceSpark closes={closes} className="h-24 sm:h-32" />
          <p className="mt-2 flex justify-between text-xs text-zinc-500 tabular-nums">
            <span>{t("24 цаг", "24 hours")}</span>
            <span>{t("Доод", "Low")} <span className="text-zinc-300">{money(lo!)}</span> · {t("Дээд", "High")} <span className="text-zinc-300">{money(hi!)}</span></span>
          </p>
        </div>
      )}
    </div>
  );
}

/** The day's answer, set larger than anything else on the screen. */
export function BiasBar({ bias, v = MN_VIEWER }: Pick<TodaySnapshot, "bias"> & { v?: Viewer }) {
  const { t } = v;
  if (!bias) return <Empty title={t("Давамгай тал", "Dominant side")} v={v} />;
  const dir = bias.label === "ӨСӨХ хандлага" ? 1 : bias.label === "УНАХ хандлага" ? -1 : 0; // i18n-ok: compared with the stored label
  const text = biasLabelText(bias.label, t);
  const [head, ...rest] = text.split(" ");
  const tone = dir > 0 ? "text-emerald-400" : dir < 0 ? "text-red-400" : "text-zinc-200";
  return (
    <section className="hallmark strike p-5 sm:p-7" aria-labelledby="bias-h">
      <h2 id="bias-h" className="sr-only">{t("Өнөөдрийн давамгай тал", "Today's dominant side")}</h2>
      {/* The hallmark: side struck in wide capitals, the score as its purity mark, the time as its serial. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className={`flex items-center gap-3 ${tone}`}>
          <Dir d={dir} className="text-[28px] sm:text-[34px]" />
          <span className="stamp text-[46px] leading-none sm:text-[64px]">{head}</span>
          {rest.length > 0 && <span className="self-end pb-1 text-base font-medium text-zinc-300 sm:text-lg">{rest.join(" ")}</span>}
        </p>
        <p className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0.5">
          <span className={`font-display text-[32px] leading-none sm:text-[40px] ${tone}`}>{signed(bias.total)}</span>
          <span className="text-xs text-zinc-500">{t("нийт оноо / 100", "total score / 100")}</span>
        </p>
      </div>
      <p className="mt-4 border-t pt-3 text-[11px] font-semibold tracking-[0.14em] text-amber-400/90 uppercase tabular-nums" style={{ borderColor: "var(--hairline-gold)" }}>
        XAUUSD · № {v.date(bias.computedAt)} · {v.time(bias.computedAt)} {v.zone}
      </p>

      <div className="mt-4 sm:mt-5">
        <div className="mb-1.5 flex justify-between gap-3 text-[13px]"><span className="text-emerald-400">{t("Худалдан авагч", "Buyers")} <b className="tabular-nums">{bias.buyerPct}%</b></span><span className="text-red-400">{t("Худалдагч", "Sellers")} <b className="tabular-nums">{100 - bias.buyerPct}%</b></span></div>
        <div className="flex h-[7px] gap-1" role="img" aria-label={t(`Худалдан авагч ${bias.buyerPct}%`, `Buyers ${bias.buyerPct}%`)}>
          <div className="rounded-full bg-emerald-500" style={{ width: `${bias.buyerPct}%` }} />
          <div className="flex-1 rounded-full bg-red-500" />
        </div>
      </div>

      <dl className="mt-4 sm:mt-5 grid grid-cols-4 divide-x divide-zinc-800 rounded-lg border border-zinc-800">
        {tfLabels(t).map(([tf, label]) => {
          const s = bias.perTimeframe[tf];
          const c = s === null || s === undefined ? "text-zinc-500" : s >= 20 ? "text-emerald-400" : s <= -20 ? "text-red-400" : "text-zinc-300";
          return (
            <div key={tf} className="px-2 py-2.5 text-center">
              <dt className="text-xs text-zinc-500">{label}</dt>
              <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${c}`}>{s === null || s === undefined ? "—" : <><Dir d={s >= 20 ? 1 : s <= -20 ? -1 : 0} /> {signed(s)}</>}</dd>
            </div>
          );
        })}
      </dl>
      <details className="group mt-3">
        <summary className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200">
          <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 transition-transform group-open:rotate-90"><path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {t("Оноо хэрхэн тооцогддог вэ", "How the score is built")}
        </summary>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t("Оноо −100…+100: тренд (EMA20/50/200), моментум (RSI, MACD), бүтэц (оргил/ёроол). Жин: өдөр 35%, 4ц 30%, 1ц 20%, 15м 15%.", "Score −100…+100: trend (EMA20/50/200), momentum (RSI, MACD), structure (highs/lows). Weights: daily 35%, 4h 30%, 1h 20%, 15m 15%.")}</p>
      </details>
    </section>
  );
}

export function LevelsCard({ levels, price, v = MN_VIEWER }: Pick<TodaySnapshot, "levels"> & { price?: number; v?: Viewer }) {
  const { t } = v;
  if (!levels) return <Empty title={t("Гол түвшин", "Key levels")} v={v} />;
  const ladder: [string, number][] = [["R2", levels.r2], ["R1", levels.r1], ["Pivot", levels.p], ["S1", levels.s1], ["S2", levels.s2]];
  const extra: [string, number | null][] = [[t("Өчигдрийн оргил", "Yesterday's high"), levels.prevHigh], [t("Өчигдрийн ёроол", "Yesterday's low"), levels.prevLow], [t("Өдрийн ATR", "Daily ATR"), levels.atr]];
  // Where the price sits on the ladder: the row it is just above gets the marker.
  const idx = price === undefined ? -1 : ladder.findIndex(([, val]) => price >= val);
  return (
    <section className="card" aria-labelledby="levels-h">
      <h2 id="levels-h" className="card-title">{t("Гол түвшин", "Key levels")}</h2>
      <ol className="relative space-y-0">
        <span aria-hidden className="absolute top-3 bottom-3 left-[5px] w-[3px] rounded-full bg-zinc-800" />
        {ladder.map(([k, val], i) => (
          <li key={k}>
            {i === idx && price !== undefined && (
              <div className="relative flex items-center gap-3 py-1 text-xs font-semibold text-amber-300">
                <span aria-hidden className="relative z-10 h-[13px] w-[13px] rounded-full border-[3px] border-zinc-50 bg-amber-400" />
                {t("Одоо", "Now")} <span className="ml-auto tabular-nums">{money(price)}</span>
              </div>
            )}
            <div className="relative flex items-baseline gap-3 py-1.5 text-sm">
              <span aria-hidden className={`relative z-10 h-[13px] w-[13px] shrink-0 self-center rounded-full border-[3px] bg-zinc-900 ${k.startsWith("R") ? "border-red-400" : k.startsWith("S") ? "border-emerald-400" : "border-zinc-400"}`} />
              <span className="text-zinc-400">{k}</span>
              <span className="ml-auto font-medium text-zinc-100 tabular-nums">{money(val)}</span>
            </div>
          </li>
        ))}
        {idx === -1 && price !== undefined && (
          <li className="relative flex items-center gap-3 py-1 text-xs font-semibold text-amber-300">
            <span aria-hidden className="relative z-10 h-[13px] w-[13px] rounded-full border-[3px] border-zinc-50 bg-amber-400" />
            {t("Одоо", "Now")} <span className="ml-auto tabular-nums">{money(price)}</span>
          </li>
        )}
      </ol>
      <dl className="mt-3 space-y-1.5 border-t border-zinc-800 pt-3 text-sm">
        {extra.map(([k, val]) => <div key={k} className="flex items-baseline justify-between gap-2"><dt className="text-zinc-400">{k}</dt><dd className="tabular-nums">{val === null ? "—" : money(val)}</dd></div>)}
      </dl>
    </section>
  );
}
