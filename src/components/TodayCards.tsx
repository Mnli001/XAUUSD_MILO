import type { ReactNode } from "react";
import type { TodaySnapshot, Levels } from "@/lib/snapshot";
import type { HourRow } from "@/lib/analysis/hourly";
import type { Reaction } from "@/lib/analysis/reaction";
import type { Timeframe } from "@/lib/analysis/indicators";
import type { GlossaryId } from "@/lib/glossary";
import { biasLabelText } from "@/lib/analysis/bias";
import { eventTitle } from "@/lib/data/calendarProvider";
import { ubHour } from "@/lib/time";
import type { T } from "@/lib/i18n";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";
import { TermHint } from "./TermHint";
import { LivePrice } from "./LiveQuote";
import { Masked, UnlockLink } from "./Paywall";
import { Countdown } from "./Countdown";
import { Icon } from "./TodayIcons";
import type { HourCell } from "./HourStrip";

/*
 * The cards of the Today page ("A · cockpit"): price, direction, next release, the 24 hours, key levels. Each paid card
 * has a locked twin that takes no data at all, so nothing paid can be read from the page without a plan.
 */

export const loadingText = (t: T) => t("Дата ачаалж байна", "Loading data");
const tfLabels = (t: T): [Timeframe, string][] => [["1day", t("Өдөр", "Day")], ["4h", t("4ц", "4h")], ["1h", t("1ц", "1h")], ["15min", t("15м", "15m")]];
const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n))}`;
const sentence = (s: string) => s.charAt(0) + s.slice(1).toLocaleLowerCase();

export function Empty({ title, v = MN_VIEWER }: { title: string; v?: Viewer }) {
  return (
    <div className="card">
      <h2 className="card-title">{title}</h2>
      <p className="flex items-center gap-2 text-sm text-zinc-500"><span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />{loadingText(v.t)}</p>
    </div>
  );
}

type Line = { name: string; price: number; tone: "r" | "p" | "s" };
const LINE_COLOR = { r: "var(--color-red-400)", p: "var(--color-zinc-500)", s: "var(--color-emerald-400)" } as const;
const LINE_TEXT = { r: "text-red-400", p: "text-zinc-500", s: "text-emerald-400" } as const;

/** Pushes label positions (in % of the height) apart so no two overlap; the order is kept. */
export function spreadLabels(ys: number[], gap: number): number[] {
  const out = [...ys];
  for (let i = 1; i < out.length; i++) if (out[i] - out[i - 1] < gap) out[i] = out[i - 1] + gap;
  return out;
}

/**
 * The last day of gold as a line, with the day's pivot levels drawn across it (paid only) and named in a gutter on the
 * right. Levels further than one day's range from the prices are left out so the line keeps its shape.
 */
export function LevelSpark({ closes, levels }: { closes: number[]; levels: Levels | null }) {
  const W = 600, H = 160;
  const lo0 = Math.min(...closes), hi0 = Math.max(...closes), span0 = hi0 - lo0 || 1;
  const all: Line[] = levels ? [{ name: "R2", price: levels.r2, tone: "r" }, { name: "R1", price: levels.r1, tone: "r" }, { name: "P", price: levels.p, tone: "p" }, { name: "S1", price: levels.s1, tone: "s" }, { name: "S2", price: levels.s2, tone: "s" }] : [];
  const lines = all.filter((l) => l.price >= lo0 - span0 && l.price <= hi0 + span0);
  const lo = Math.min(lo0, ...lines.map((l) => l.price)), hi = Math.max(hi0, ...lines.map((l) => l.price));
  const pad = (hi - lo || 1) * 0.06, top = hi + pad, bottom = lo - pad;
  const yPct = (v: number) => ((top - v) / (top - bottom)) * 100;
  const x = (i: number) => (i / (closes.length - 1)) * W;
  const y = (v: number) => (yPct(v) / 100) * H;
  let d = `M${x(0)} ${y(closes[0])}`;
  for (let i = 1; i < closes.length; i++) {
    const mx = (x(i - 1) + x(i)) / 2;
    d += ` C${mx} ${y(closes[i - 1])} ${mx} ${y(closes[i])} ${x(i)} ${y(closes[i])}`;
  }
  const labelY = spreadLabels(lines.map((l) => yPct(l.price)), 11);
  const lastY = yPct(closes[closes.length - 1]);
  return (
    <div aria-hidden className={`relative h-32 sm:h-36 ${lines.length ? "pr-[4.5rem]" : ""}`}>
      <div className="relative h-full">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="draw-line h-full w-full overflow-visible">
          <defs>
            <linearGradient id="lvl-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-amber-400)" stopOpacity="0.3" />
              <stop offset="1" stopColor="var(--color-amber-400)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {lines.map((l) => <line key={l.name} x1="0" x2={W} y1={y(l.price)} y2={y(l.price)} stroke={LINE_COLOR[l.tone]} strokeOpacity="0.6" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />)}
          <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#lvl-fill)" />
          <path d={d} fill="none" stroke="var(--color-amber-300)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="now-pulse absolute right-0 h-2.5 w-2.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300" style={{ top: `${lastY}%` }} />
      </div>
      {lines.map((l, i) => (
        <span key={l.name} data-level={l.name} className={`absolute right-0 -translate-y-1/2 text-xs font-medium whitespace-nowrap tabular-nums ${LINE_TEXT[l.tone]}`} style={{ top: `${labelY[i]}%` }}>
          {l.name} {Math.round(l.price).toLocaleString("en-US")}
        </span>
      ))}
    </div>
  );
}

/** The price, its change and freshness, and the last day as a line with today's levels across it. */
export function PriceCard({ price, closes, levels, v = MN_VIEWER }: Pick<TodaySnapshot, "price"> & { closes: number[]; levels: Levels | null; v?: Viewer }) {
  const { t } = v;
  if (!price) return <Empty title="XAUUSD" v={v} />;
  const hi = closes.length ? Math.max(...closes) : null, lo = closes.length ? Math.min(...closes) : null;
  return (
    <section className="card flex h-full flex-col gap-3" aria-labelledby="price-h">
      <p className="flex items-center gap-2 text-[13px]">
        <span id="price-h" className="font-semibold tracking-[0.08em] text-amber-400">XAUUSD</span>
        <span className="text-zinc-500">{t("Алт / ам.доллар", "Gold / US dollar")}</span>
      </p>
      <div className="-mt-2"><LivePrice last={price.last} prevClose={price.changePct !== null ? price.last / (1 + price.changePct / 100) : null} updatedAt={price.updatedAt.toISOString()} /></div>
      {closes.length >= 8 && (
        <div className="mt-auto">
          <LevelSpark closes={closes} levels={levels} />
          <p className="mt-2 flex justify-between gap-3 text-xs text-zinc-500 tabular-nums">
            <span>{t("24 цаг", "24 hours")}</span>
            <span>{t("Доод", "Low")} <span className="text-zinc-300">{money(lo!)}</span> · {t("Дээд", "High")} <span className="text-zinc-300">{money(hi!)}</span></span>
          </p>
        </div>
      )}
    </section>
  );
}

const DirTitle = ({ t }: { t: T }) => (
  <h2 id="bias-h" className="flex items-center gap-2 text-[13px] font-medium text-zinc-400">
    <Icon name="bolt" className="h-4 w-4 text-amber-400" />{t("Өдрийн чиглэл", "Today's direction")}
  </h2>
);

/** Which side leads today: the word, the score, buyers against sellers and the four timeframes. */
export function DirectionCard({ bias, v = MN_VIEWER }: Pick<TodaySnapshot, "bias"> & { v?: Viewer }) {
  const { t } = v;
  if (!bias) return <Empty title={t("Өдрийн чиглэл", "Today's direction")} v={v} />;
  const dir = bias.label === "ӨСӨХ хандлага" ? 1 : bias.label === "УНАХ хандлага" ? -1 : 0; // i18n-ok: compared with the stored label
  const [head, ...rest] = biasLabelText(bias.label, t).split(" ");
  const tone = dir > 0 ? "text-emerald-400" : dir < 0 ? "text-red-400" : "text-zinc-100";
  return (
    <section className="card flex h-full flex-col gap-4" aria-labelledby="bias-h">
      <DirTitle t={t} />
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <p className={tone}>
          <span className="font-display block text-[28px] leading-none sm:text-[44px]">{sentence(head)}</span>
          {rest.length > 0 && <span className="mt-1.5 block text-sm text-zinc-400">{rest.join(" ")}</span>}
        </p>
        <p className="sm:text-right">
          <span className={`num block text-[24px] leading-none sm:text-[34px] ${tone}`}>{signed(bias.total)}</span>
          <span className="mt-1 block text-xs text-zinc-500">{t("оноо", "score")}</span>
        </p>
      </div>
      <div>
        <p className="mb-2 flex justify-between gap-2 text-xs font-semibold tabular-nums sm:text-sm">
          <span className="text-emerald-400"><span className="max-sm:hidden">{t("Худалдан авагч", "Buyers")} </span>{bias.buyerPct}%</span>
          <span className="text-red-400"><span className="max-sm:hidden">{t("Худалдагч", "Sellers")} </span>{100 - bias.buyerPct}%</span>
        </p>
        <div className="flex h-2 gap-1" role="img" aria-label={t(`Худалдан авагч ${bias.buyerPct}%, худалдагч ${100 - bias.buyerPct}%`, `Buyers ${bias.buyerPct}%, sellers ${100 - bias.buyerPct}%`)}>
          <div className="rounded-full bg-emerald-400" style={{ width: `${bias.buyerPct}%` }} />
          <div className="flex-1 rounded-full bg-red-400" />
        </div>
      </div>
      <dl className="mt-auto grid grid-cols-4 gap-2 max-sm:hidden">
        {tfLabels(t).map(([tf, label]) => {
          const s = bias.perTimeframe[tf];
          const c = s === null || s === undefined ? "text-zinc-500" : s >= 20 ? "text-emerald-400" : s <= -20 ? "text-red-400" : "text-zinc-200";
          return (
            <div key={tf} className="glass-tile px-1 py-2 text-center">
              <dt className="text-xs text-zinc-500">{label}</dt>
              <dd className={`mt-0.5 text-base font-semibold tabular-nums ${c}`}>{s === null || s === undefined ? "—" : signed(s)}</dd>
            </div>
          );
        })}
      </dl>
      <details className="text-xs text-zinc-500 max-sm:hidden">
        <summary className="cursor-pointer hover:text-zinc-300">{t(`Оноо хэрхэн тооцогддог вэ · ${v.time(bias.computedAt)} ${v.zone}`, `How the score is built · ${v.time(bias.computedAt)} ${v.zone}`)}</summary>
        <p className="mt-2 leading-relaxed">{t("Оноо −100…+100: trend (EMA20/50/200), momentum (RSI, MACD), бүтэц (оргил/ёроол). Жин: өдөр 35%, 4ц 30%, 1ц 20%, 15м 15%. ±20-оос дотогш бол тодорхой тал алга.", "Score −100…+100: trend (EMA20/50/200), momentum (RSI, MACD), structure (highs/lows). Weights: daily 35%, 4h 30%, 1h 20%, 15m 15%. Inside ±20 neither side leads.")}</p>
      </details>
    </section>
  );
}

/** The direction card for someone without a plan: the same frame, every figure masked. Takes no data on purpose. */
export function DirectionCardLocked({ v = MN_VIEWER }: { v?: Viewer }) {
  const { t } = v;
  return (
    <section className="card flex h-full flex-col gap-4" aria-labelledby="bias-h">
      <DirTitle t={t} />
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <Masked t={t} className="text-[28px] leading-none sm:text-[40px]" />
        <p className="sm:text-right"><Masked t={t} className="block text-[22px] leading-none sm:text-[30px]" /><span className="mt-1 block text-xs text-zinc-500">{t("оноо", "score")}</span></p>
      </div>
      <p className="flex justify-between gap-2 text-xs text-zinc-400 sm:text-sm">
        <span><span className="max-sm:hidden">{t("Худалдан авагч", "Buyers")} </span><Masked t={t} /></span>
        <span><span className="max-sm:hidden">{t("Худалдагч", "Sellers")} </span><Masked t={t} /></span>
      </p>
      <div aria-hidden className="h-2 rounded-full bg-zinc-800" />
      <dl className="mt-auto grid grid-cols-4 gap-2 max-sm:hidden">
        {tfLabels(t).map(([tf, label]) => (
          <div key={tf} className="glass-tile px-1 py-2 text-center"><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-0.5 text-sm"><Masked t={t} /></dd></div>
        ))}
      </dl>
      <UnlockLink t={t} />
    </section>
  );
}

/** The next high-impact release in gold: its name, when, a live countdown and how gold moved after it before. */
export function NextReleaseCard({ next, stats, v = MN_VIEWER }: { next: { time: Date; type: string; title: string } | null; stats: Reaction[] | undefined; v?: Viewer }) {
  const { t } = v;
  if (!next) {
    return (
      <section className="card h-full" aria-labelledby="next-h">
        <h2 id="next-h" className="flex items-center gap-2 text-[13px] font-medium text-zinc-400"><Icon name="clock" className="h-4 w-4 text-amber-400" />{t("Дараагийн чухал мэдээ", "Next key release")}</h2>
        <p className="mt-3 text-sm text-zinc-500">{t("Бүртгэгдсэн чухал мэдээ алга", "No important releases on record")}</p>
      </section>
    );
  }
  const hour = stats?.find((s) => s.minutes === 60);
  return (
    <section className="sheen relative flex h-full flex-col gap-1.5 overflow-hidden rounded-[26px] p-4 sm:p-6" style={{ background: "var(--accent-bg)", color: "var(--accent-fg)" }} aria-labelledby="next-h">
      <p className="flex items-center gap-1.5 text-xs font-semibold"><Icon name="clock" className="h-4 w-4" />{t("Дараагийн чухал мэдээ", "Next key release")}</p>
      <h2 id="next-h" className="font-display text-[18px] leading-tight sm:text-[26px]">{eventTitle(next, t)}</h2>
      <p className="text-xs tabular-nums opacity-75">{v.date(next.time)} · {v.time(next.time)} {v.zone}</p>
      <div className="mt-auto pt-3">
        <p className="text-xs opacity-75">{t("Үлдсэн хугацаа", "Time left")}</p>
        <p className="text-[22px] leading-tight font-bold tabular-nums sm:text-[30px]"><Countdown to={next.time.toISOString()} /></p>
      </div>
      {hour && hour.avgAbsMove !== null && (
        <p className="mt-2 rounded-xl px-3 py-2 text-xs leading-snug max-sm:hidden" style={{ background: "rgb(26 20 7 / 0.1)" }}>
          {t(`Өмнөх ${hour.n} удаад: 1 цагт дунджаар ±$${hour.avgAbsMove.toFixed(0)} хөдөлсөн`, `The last ${hour.n} times: gold moved ±$${hour.avgAbsMove.toFixed(0)} on average within an hour`)}
        </p>
      )}
    </section>
  );
}

const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * The next 24 hours from the current UB hour, as plain cells for the strip: the odds of rising (conditional when the
 * sample allows), the sample, the average move and the release that falls within half an hour of the hour, if any.
 */
export function hourCells(rows: HourRow[], nowHour: number, events: { time: Date; title: string; type?: string }[], v: Viewer = MN_VIEWER): HourCell[] {
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  const news = new Map<number, string>();
  for (const e of events) {
    const at = new Date(e.time).getTime();
    for (const h of [ubHour(new Date(at - 30 * 6e4)), ubHour(new Date(at + 30 * 6e4))]) news.set(h, e.type ? eventTitle({ type: e.type, title: e.title }, v.t) : e.title);
  }
  return Array.from({ length: 24 }, (_, i) => (nowHour + i) % 24).map((h) => byHour.get(h)).filter((r): r is HourRow => !!r).map((r) => {
    const cond = r.upPctCond !== null;
    return { hour: r.hour, label: v.ub(pad(r.hour)), session: r.session, up: cond ? r.upPctCond : r.upPct, n: cond ? r.nCond : r.n, cond, avg: r.avgMove, news: news.get(r.hour) ?? null };
  });
}

/** R2 … S2 with the price placed among them, then yesterday's range and the daily ATR. */
export function KeyLevels({ levels, price, v = MN_VIEWER }: Pick<TodaySnapshot, "levels"> & { price?: number; v?: Viewer }) {
  const { t } = v;
  if (!levels) return <Empty title={t("Гол түвшин", "Key levels")} v={v} />;
  const ladder: [string, number][] = [["R2", levels.r2], ["R1", levels.r1], ["Pivot", levels.p], ["S1", levels.s1], ["S2", levels.s2]];
  const extra: [string, number | null, GlossaryId?][] = [[t("Өчигдрийн оргил", "Yesterday's high"), levels.prevHigh], [t("Өчигдрийн ёроол", "Yesterday's low"), levels.prevLow], [t("Өдрийн ATR", "Daily ATR"), levels.atr, "atr"]];
  const idx = price === undefined ? -1 : ladder.findIndex(([, val]) => price >= val);
  const now = price !== undefined && (
    <li data-now className="-mx-2.5 flex items-center gap-3 rounded-xl bg-amber-400/10 px-2.5 py-2 text-sm font-semibold text-amber-300">
      <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />{t("Одоо", "Now")}<span className="ml-auto tabular-nums">{money(price)}</span>
    </li>
  );
  return (
    <section className="card" aria-labelledby="levels-h">
      <h2 id="levels-h" className="flex items-center gap-2 text-base font-semibold text-zinc-100"><Icon name="layers" className="h-[18px] w-[18px] text-amber-400" />{t("Гол түвшин", "Key levels")}<TermHint id="pivot" /></h2>
      <ol className="mt-3">
        {ladder.map(([k, val], i) => (
          <LevelItem key={k} k={k} val={val} before={i === idx ? now : null} />
        ))}
        {idx === -1 && now}
      </ol>
      <dl className="mt-3 space-y-1.5 border-t pt-3 text-sm" style={{ borderColor: "var(--hairline)" }}>
        {extra.map(([k, val, hint]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-zinc-500">{k}{hint && <TermHint id={hint} />}</dt>
            <dd className="font-medium text-zinc-300 tabular-nums">{val === null ? "—" : money(val)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function LevelItem({ k, val, before }: { k: string; val: number; before: ReactNode }) {
  const dot = k.startsWith("R") ? "bg-red-400" : k.startsWith("S") ? "bg-emerald-400" : "bg-zinc-500";
  return (
    <>
      {before}
      <li className="flex items-center gap-3 py-2 text-sm">
        <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="font-semibold text-zinc-300">{k}</span>
        <span className="ml-auto font-medium text-zinc-100 tabular-nums">{money(val)}</span>
      </li>
    </>
  );
}

/** The key-levels card for someone without a plan: the level names, masked prices, no "now" marker. Takes no data on purpose. */
export function KeyLevelsLocked({ v = MN_VIEWER }: { v?: Viewer }) {
  const { t } = v;
  const extra = [t("Өчигдрийн оргил", "Yesterday's high"), t("Өчигдрийн ёроол", "Yesterday's low"), t("Өдрийн ATR", "Daily ATR")];
  return (
    <section className="card" aria-labelledby="levels-h">
      <h2 id="levels-h" className="flex items-center gap-2 text-base font-semibold text-zinc-100"><Icon name="layers" className="h-[18px] w-[18px] text-amber-400" />{t("Гол түвшин", "Key levels")}<TermHint id="pivot" /></h2>
      <ol className="mt-3">
        {["R2", "R1", "Pivot", "S1", "S2"].map((k) => (
          <li key={k} className="flex items-center gap-3 py-2 text-sm">
            <span aria-hidden className={`h-2 w-2 rounded-full ${k.startsWith("R") ? "bg-red-400" : k.startsWith("S") ? "bg-emerald-400" : "bg-zinc-500"}`} />
            <span className="font-semibold text-zinc-300">{k}</span><span className="ml-auto"><Masked t={t} /></span>
          </li>
        ))}
      </ol>
      <dl className="mt-3 space-y-1.5 border-t pt-3 text-sm" style={{ borderColor: "var(--hairline)" }}>
        {extra.map((k) => <div key={k} className="flex items-baseline justify-between gap-3"><dt className="text-zinc-500">{k}</dt><dd><Masked t={t} /></dd></div>)}
      </dl>
      <div className="mt-3"><UnlockLink t={t} /></div>
    </section>
  );
}
