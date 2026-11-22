import type { TodaySnapshot } from "@/lib/snapshot";
import type { Timeframe } from "@/lib/analysis/indicators";
import { biasLabelText } from "@/lib/analysis/bias";
import type { T } from "@/lib/i18n";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";

export const loadingText = (t: T) => t("Дата ачаалж байна", "Loading data");
const tfLabels = (t: T): [Timeframe, string][] => [["1day", t("Өдөр", "Day")], ["4h", t("4ц", "4h")], ["1h", t("1ц", "1h")], ["15min", t("15м", "15m")]];
const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Empty({ title, v = MN_VIEWER }: { title: string; v?: Viewer }) {
  return <div className="card"><h2 className="card-title">{title}</h2><p className="text-zinc-500">{loadingText(v.t)}</p></div>;
}

export function PriceHeader({ price, bias, v = MN_VIEWER }: Pick<TodaySnapshot, "price" | "bias"> & { v?: Viewer }) {
  const { t } = v;
  if (!price) return <Empty title="XAUUSD" v={v} />;
  const up = (price.changePct ?? 0) >= 0;
  const labelColor = bias?.label === "ӨСӨХ хандлага" ? "text-emerald-400" : bias?.label === "УНАХ хандлага" ? "text-red-400" : "text-zinc-300"; // i18n-ok: compared with the stored label
  return (
    <div className="card flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <div className="text-sm text-zinc-400">{t("Алт, XAUUSD", "Gold, XAUUSD")}</div>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-4xl font-semibold tracking-tight sm:text-5xl">{money(price.last)}</span>
          {price.changePct !== null && <span className={up ? "text-emerald-400" : "text-red-400"}>{up ? "▲" : "▼"} {Math.abs(price.changePct).toFixed(2)}%</span>}
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          {t("Сүүлд шинэчлэгдсэн", "Last updated")} {v.time(price.updatedAt)}
          {price.stale && <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">{t("Хоцролттой", "Delayed")}</span>}
        </div>
      </div>
      {bias && <div className="sm:text-right"><div className="text-sm text-zinc-400">{t("Чиглэл", "Direction")}</div><div className={`text-xl font-semibold sm:text-2xl ${labelColor}`}>{biasLabelText(bias.label, t)}</div></div>}
    </div>
  );
}

export function BiasBar({ bias, v = MN_VIEWER }: Pick<TodaySnapshot, "bias"> & { v?: Viewer }) {
  const { t } = v;
  if (!bias) return <Empty title={t("Давамгай тал", "Dominant side")} v={v} />;
  return (
    <div className="card">
      <h2 className="card-title">{t("Давамгай тал", "Dominant side")}</h2>
      <div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="text-emerald-400">{t("Худалдан авагч", "Buyers")} {bias.buyerPct}%</span><span className="text-red-400">{t("Худалдагч", "Sellers")} {100 - bias.buyerPct}%</span></div>
      <div className="flex h-3 overflow-hidden rounded-full bg-red-500/70" role="img" aria-label={t(`Худалдан авагч ${bias.buyerPct}%`, `Buyers ${bias.buyerPct}%`)}>
        <div className="bg-emerald-500" style={{ width: `${bias.buyerPct}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 text-sm sm:flex sm:flex-wrap">
        {tfLabels(t).map(([tf, label]) => {
          const s = bias.perTimeframe[tf];
          return (
            <span key={tf} className="flex flex-col items-center gap-0.5 rounded-lg border border-zinc-800 px-2 py-1.5 font-mono sm:flex-row sm:gap-1.5">
              <span className="text-xs text-zinc-400 sm:text-sm">{label}</span>
              {s === null || s === undefined ? <span className="text-zinc-500">—</span> : s >= 20 ? <span className="text-emerald-400">▲ {Math.round(s)}</span> : s <= -20 ? <span className="text-red-400">▼ {Math.round(s)}</span> : <span className="text-zinc-300">● {Math.round(s)}</span>}
            </span>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-zinc-500">{t("Оноо −100…+100: тренд (EMA20/50/200), моментум (RSI, MACD), бүтэц (оргил/ёроол). Жин: өдөр 35%, 4ц 30%, 1ц 20%, 15м 15%.", "Score −100…+100: trend (EMA20/50/200), momentum (RSI, MACD), structure (highs/lows). Weights: daily 35%, 4h 30%, 1h 20%, 15m 15%.")}</p>
    </div>
  );
}

export function LevelsCard({ levels, v = MN_VIEWER }: Pick<TodaySnapshot, "levels"> & { v?: Viewer }) {
  const { t } = v;
  if (!levels) return <Empty title={t("Гол түвшин", "Key levels")} v={v} />;
  const items: [string, number | null][] = [["R2", levels.r2], ["R1", levels.r1], ["Pivot", levels.p], ["S1", levels.s1], ["S2", levels.s2], [t("Өчигдрийн оргил", "Yesterday's high"), levels.prevHigh], [t("Өчигдрийн ёроол", "Yesterday's low"), levels.prevLow], [t("Өдрийн ATR", "Daily ATR"), levels.atr]];
  return (
    <div className="card">
      <h2 className="card-title">{t("Гол түвшин", "Key levels")}</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm min-[420px]:grid-cols-2 lg:grid-cols-1">
        {items.map(([k, val]) => <div key={k} className="flex items-baseline justify-between gap-2"><dt className="text-zinc-400">{k}</dt><dd className="font-mono">{val === null ? "—" : money(val)}</dd></div>)}
      </dl>
    </div>
  );
}
