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
  const bgGlow = dir > 0 ? "bg-emerald-500/5" : dir < 0 ? "bg-red-500/5" : "bg-zinc-800/5";
  
  return (
    <section className="hallmark strike group relative overflow-hidden p-6 sm:p-8 transition-all duration-500 hover:shadow-2xl" aria-labelledby="bias-h">
      <div className={`absolute -right-10 -top-10 h-48 w-48 rounded-full blur-3xl transition-all duration-700 group-hover:scale-150 ${bgGlow}`} aria-hidden />
      
      <div className="relative z-10">
        <h2 id="bias-h" className="sr-only">{t("Өнөөдрийн давамгай тал", "Today's dominant side")}</h2>
        
        <div className="inline-flex items-center gap-2 rounded-xl bg-zinc-900/50 px-3 py-1.5 backdrop-blur-sm">
          <svg className="h-4 w-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
          </svg>
          <span className="text-xs font-bold tracking-wider uppercase text-zinc-400">{t("Өнөөдрийн чиглэл", "Today's Direction")}</span>
        </div>
        
        {/* The hallmark: side struck in wide capitals, the score as its purity mark, the time as its serial. */}
        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className={`flex items-center gap-4 ${tone}`}>
            <Dir d={dir} className="text-[32px] sm:text-[40px] transition-transform duration-300 group-hover:scale-110" />
            <div>
              <span className="stamp block text-[52px] leading-none sm:text-[72px] transition-all duration-300 group-hover:scale-105">{head}</span>
              {rest.length > 0 && <span className="mt-1 block text-lg font-medium text-zinc-300 sm:text-xl">{rest.join(" ")}</span>}
            </div>
          </div>
          <div className="text-right">
            <span className={`num block text-[40px] leading-none sm:text-[52px] transition-all duration-300 group-hover:scale-105 ${tone}`}>{signed(bias.total)}</span>
            <span className="mt-1 block text-xs text-zinc-500">{t("нийт оноо / 100", "total score / 100")}</span>
          </div>
        </div>
        
        <div className="mt-5 rounded-xl border border-amber-400/20 bg-zinc-900/30 px-4 py-3 backdrop-blur-sm">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-amber-400/90 uppercase tabular-nums">
            XAUUSD · № {v.date(bias.computedAt)} · {v.time(bias.computedAt)} {v.zone}
          </p>
        </div>

      <div className="mt-5 sm:mt-6">
        <div className="mb-2 flex justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 font-semibold text-emerald-400">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
            </svg>
            {t("Худалдан авагч", "Buyers")} <b className="tabular-nums">{bias.buyerPct}%</b>
          </span>
          <span className="flex items-center gap-2 font-semibold text-red-400">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
            </svg>
            {t("Худалдагч", "Sellers")} <b className="tabular-nums">{100 - bias.buyerPct}%</b>
          </span>
        </div>
        <div className="flex h-2 gap-1 overflow-hidden rounded-full" role="img" aria-label={t(`Худалдан авагч ${bias.buyerPct}%`, `Buyers ${bias.buyerPct}%`)}>
          <div className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-lg shadow-emerald-500/20 transition-all duration-700" style={{ width: `${bias.buyerPct}%` }} />
          <div className="flex-1 rounded-full bg-gradient-to-r from-red-400 to-red-500 shadow-lg shadow-red-500/20" />
        </div>
      </div>

      <dl className="mt-5 sm:mt-6 grid grid-cols-4 divide-x divide-zinc-800/50 overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900/30 backdrop-blur-sm">
        {tfLabels(t).map(([tf, label]) => {
          const s = bias.perTimeframe[tf];
          const c = s === null || s === undefined ? "text-zinc-500" : s >= 20 ? "text-emerald-400" : s <= -20 ? "text-red-400" : "text-zinc-300";
          const bgColor = s === null || s === undefined ? "" : s >= 20 ? "bg-emerald-500/5" : s <= -20 ? "bg-red-500/5" : "";
          return (
            <div key={tf} className={`group relative px-2 py-3.5 text-center transition-all duration-300 hover:bg-white/5 ${bgColor}`}>
              <dt className="text-xs font-medium text-zinc-500 transition-colors duration-300 group-hover:text-zinc-400">{label}</dt>
              <dd className={`mt-1 text-xl font-bold tabular-nums transition-all duration-300 group-hover:scale-110 ${c}`}>
                {s === null || s === undefined ? "—" : <><Dir d={s >= 20 ? 1 : s <= -20 ? -1 : 0} /> {signed(s)}</>}
              </dd>
            </div>
          );
        })}
      </dl>
      
      <details className="group mt-4">
        <summary className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-zinc-400 transition-all duration-200 hover:bg-zinc-800/50 hover:text-zinc-200">
          <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 transition-transform duration-300 group-open:rotate-90">
            <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("Оноо хэрхэн тооцогддог вэ", "How the score is built")}
        </summary>
        <p className="mt-2 rounded-xl bg-zinc-900/50 px-4 py-3 text-xs leading-relaxed text-zinc-500">
          {t("Оноо −100…+100: тренд (EMA20/50/200), моментум (RSI, MACD), бүтэц (оргил/ёроол). Жин: өдөр 35%, 4ц 30%, 1ц 20%, 15м 15%.", "Score −100…+100: trend (EMA20/50/200), momentum (RSI, MACD), structure (highs/lows). Weights: daily 35%, 4h 30%, 1h 20%, 15m 15%.")}
        </p>
      </details>
      </div>
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
    <section className="card group relative overflow-hidden transition-all duration-500 hover:shadow-2xl" aria-labelledby="levels-h">
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-400/5 blur-3xl transition-all duration-700 group-hover:scale-150 group-hover:bg-amber-400/10" aria-hidden />
      
      <div className="relative z-10">
        <h2 id="levels-h" className="card-title flex items-center gap-2">
          <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          {t("Гол түвшин", "Key levels")}
        </h2>
        
        <ol className="relative mt-4 space-y-0">
          <span aria-hidden className="absolute top-4 bottom-4 left-[6px] w-[3px] rounded-full bg-gradient-to-b from-red-500/30 via-zinc-700 to-emerald-500/30" />
          {ladder.map(([k, val], i) => (
            <li key={k}>
              {i === idx && price !== undefined && (
                <div className="relative flex items-center gap-3 py-1.5 text-xs font-bold text-amber-300 transition-all duration-300 hover:scale-105">
                  <span aria-hidden className="relative z-10 flex h-[15px] w-[15px] items-center justify-center rounded-full border-[3px] border-amber-400 bg-zinc-900">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                  </span>
                  <span className="flex items-center gap-2">
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    {t("Одоо", "Now")}
                  </span>
                  <span className="ml-auto font-mono tabular-nums">{money(price)}</span>
                </div>
              )}
              <div className="group/item relative flex items-baseline gap-3 py-2 text-sm transition-all duration-200 hover:scale-105">
                <span aria-hidden className={`relative z-10 h-[15px] w-[15px] shrink-0 self-center rounded-full border-[3px] bg-zinc-900 shadow-lg transition-all duration-300 group-hover/item:scale-125 ${
                  k.startsWith("R") 
                    ? "border-red-400 shadow-red-400/20" 
                    : k.startsWith("S") 
                    ? "border-emerald-400 shadow-emerald-400/20" 
                    : "border-zinc-400 shadow-zinc-400/20"
                }`} />
                <span className={`font-semibold transition-colors duration-200 group-hover/item:text-zinc-200 ${
                  k.startsWith("R") ? "text-red-400" : k.startsWith("S") ? "text-emerald-400" : "text-zinc-400"
                }`}>{k}</span>
                <span className="ml-auto font-mono font-medium text-zinc-100 tabular-nums transition-colors duration-200 group-hover/item:text-amber-400">{money(val)}</span>
              </div>
            </li>
          ))}
          {idx === -1 && price !== undefined && (
            <li className="relative flex items-center gap-3 py-1.5 text-xs font-bold text-amber-300 transition-all duration-300 hover:scale-105">
              <span aria-hidden className="relative z-10 flex h-[15px] w-[15px] items-center justify-center rounded-full border-[3px] border-amber-400 bg-zinc-900">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              </span>
              <span className="flex items-center gap-2">
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                {t("Одоо", "Now")}
              </span>
              <span className="ml-auto font-mono tabular-nums">{money(price)}</span>
            </li>
          )}
        </ol>
        
        <dl className="mt-4 space-y-2 rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4 backdrop-blur-sm text-sm">
          {extra.map(([k, val]) => (
            <div key={k} className="group/stat flex items-baseline justify-between gap-3 transition-all duration-200 hover:scale-105">
              <dt className="font-medium text-zinc-400 transition-colors duration-200 group-hover/stat:text-zinc-300">{k}</dt>
              <dd className="font-mono font-semibold tabular-nums text-zinc-100 transition-colors duration-200 group-hover/stat:text-amber-400">
                {val === null ? "—" : money(val)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
