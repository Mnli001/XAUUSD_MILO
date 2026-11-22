import type { TodaySnapshot } from "@/lib/snapshot";
import type { Timeframe } from "@/lib/analysis/indicators";
import { formatUbTime } from "@/lib/time";

export const LOADING = "Дата ачаалж байна";
const TF_LABEL: [Timeframe, string][] = [["1day", "Өдөр"], ["4h", "4ц"], ["1h", "1ц"], ["15min", "15м"]];
const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Empty({ title }: { title: string }) {
  return <div className="card"><h2 className="card-title">{title}</h2><p className="text-zinc-500">{LOADING}</p></div>;
}

export function PriceHeader({ price, bias }: Pick<TodaySnapshot, "price" | "bias">) {
  if (!price) return <Empty title="XAUUSD" />;
  const up = (price.changePct ?? 0) >= 0;
  const labelColor = bias?.label === "ӨСӨХ хандлага" ? "text-emerald-400" : bias?.label === "УНАХ хандлага" ? "text-red-400" : "text-zinc-300";
  return (
    <div className="card flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <div className="text-sm text-zinc-400">Алт, XAUUSD</div>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-4xl font-semibold tracking-tight sm:text-5xl">{money(price.last)}</span>
          {price.changePct !== null && <span className={up ? "text-emerald-400" : "text-red-400"}>{up ? "▲" : "▼"} {Math.abs(price.changePct).toFixed(2)}%</span>}
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          Сүүлд шинэчлэгдсэн {formatUbTime(price.updatedAt)}
          {price.stale && <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">Хоцролттой</span>}
        </div>
      </div>
      {bias && <div className="sm:text-right"><div className="text-sm text-zinc-400">Чиглэл</div><div className={`text-xl font-semibold sm:text-2xl ${labelColor}`}>{bias.label}</div></div>}
    </div>
  );
}

export function BiasBar({ bias }: Pick<TodaySnapshot, "bias">) {
  if (!bias) return <Empty title="Давамгай тал" />;
  return (
    <div className="card">
      <h2 className="card-title">Давамгай тал</h2>
      <div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="text-emerald-400">Худалдан авагч {bias.buyerPct}%</span><span className="text-red-400">Худалдагч {100 - bias.buyerPct}%</span></div>
      <div className="flex h-3 overflow-hidden rounded-full bg-red-500/70" role="img" aria-label={`Худалдан авагч ${bias.buyerPct}%`}>
        <div className="bg-emerald-500" style={{ width: `${bias.buyerPct}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 text-sm sm:flex sm:flex-wrap">
        {TF_LABEL.map(([tf, label]) => {
          const s = bias.perTimeframe[tf];
          return (
            <span key={tf} className="flex flex-col items-center gap-0.5 rounded-lg border border-zinc-800 px-2 py-1.5 font-mono sm:flex-row sm:gap-1.5">
              <span className="text-xs text-zinc-400 sm:text-sm">{label}</span>
              {s === null || s === undefined ? <span className="text-zinc-500">—</span> : s >= 20 ? <span className="text-emerald-400">▲ {Math.round(s)}</span> : s <= -20 ? <span className="text-red-400">▼ {Math.round(s)}</span> : <span className="text-zinc-300">● {Math.round(s)}</span>}
            </span>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-zinc-500">Оноо −100…+100: тренд (EMA20/50/200), моментум (RSI, MACD), бүтэц (оргил/ёроол). Жин: өдөр 35%, 4ц 30%, 1ц 20%, 15м 15%.</p>
    </div>
  );
}

export function LevelsCard({ levels }: Pick<TodaySnapshot, "levels">) {
  if (!levels) return <Empty title="Гол түвшин" />;
  const items: [string, number | null][] = [["R2", levels.r2], ["R1", levels.r1], ["Pivot", levels.p], ["S1", levels.s1], ["S2", levels.s2], ["Өчигдрийн оргил", levels.prevHigh], ["Өчигдрийн ёроол", levels.prevLow], ["Өдрийн ATR", levels.atr]];
  return (
    <div className="card">
      <h2 className="card-title">Гол түвшин</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm min-[420px]:grid-cols-2 lg:grid-cols-1">
        {items.map(([k, v]) => <div key={k} className="flex items-baseline justify-between gap-2"><dt className="text-zinc-400">{k}</dt><dd className="font-mono">{v === null ? "—" : money(v)}</dd></div>)}
      </dl>
    </div>
  );
}
