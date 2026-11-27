import Link from "next/link";
import { biasLabelText } from "@/lib/analysis/bias";
import { digitsOf, marketName } from "@/lib/marketList";
import type { MarketView } from "@/lib/markets";
import type { Viewer } from "@/lib/viewer";

const fmt = (v: number, d: number) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const TF_LABEL = { "1h": "1H", "4h": "4H", "1day": "D1" } as const;

function Arrow({ score }: { score: number | null }) {
  if (score === null) return <span className="text-zinc-600">—</span>;
  if (score >= 20) return <span className="text-emerald-300">↑</span>;
  if (score <= -20) return <span className="text-rose-300">↓</span>;
  return <span className="text-zinc-400">→</span>;
}

export function MarketCards({ items, selected, v }: { items: { symbol: string; view: MarketView | null }[]; selected: string; v: Viewer }) {
  const { t } = v;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(({ symbol, view }) => {
        const d = digitsOf(symbol);
        const on = symbol === selected;
        return (
          <Link key={symbol} href={`/markets?s=${symbol}#chart`} aria-current={on ? "true" : undefined}
            className={`card block transition-colors ${on ? "ring-1 ring-amber-300/50" : "hover:ring-1 hover:ring-white/10"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-zinc-100">{marketName(symbol, t)}</h2>
              <span className="text-xs text-zinc-500">{symbol}</span>
            </div>
            {view ? (
              <>
                <p className="mt-2 flex items-baseline gap-3">
                  <span className="text-2xl font-semibold text-zinc-50 tabular-nums">{fmt(view.price, d)}</span>
                  {view.changePct !== null && <span className={`text-sm tabular-nums ${view.changePct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{view.changePct >= 0 ? "+" : "−"}{Math.abs(view.changePct).toFixed(2)}%</span>}
                </p>
                {view.bias && (
                  <div className="mt-3">
                    <p className="text-sm text-zinc-300">{biasLabelText(view.bias.label, t)} <span className="text-zinc-500 tabular-nums">· {t("авагч", "buyers")} {view.bias.buyerPct}%</span></p>
                    <span aria-hidden className="mt-1.5 block h-1.5 rounded-full bg-rose-400/40"><span className="block h-1.5 rounded-full bg-emerald-400/80" style={{ width: `${view.bias.buyerPct}%` }} /></span>
                  </div>
                )}
                <div className="mt-3 flex gap-2 text-xs">
                  {(Object.keys(TF_LABEL) as (keyof typeof TF_LABEL)[]).map((tf) => (
                    <span key={tf} className="glass-pill tabular-nums"><span className="text-zinc-500">{TF_LABEL[tf]}</span> <Arrow score={view.scores[tf]} /></span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-zinc-500 tabular-nums">
                  {view.prevHigh !== null && view.prevLow !== null && <>{t("Өчигдөр", "Yesterday")} {fmt(view.prevLow, d)} – {fmt(view.prevHigh, d)} · </>}
                  {view.atr !== null && <>ATR {fmt(view.atr, d)} · </>}
                  {v.time(view.updatedAt)}
                </p>
              </>
            ) : <p className="mt-2 text-sm text-zinc-500">{t("Өгөгдөл хараахан ирээгүй. Цаг тутам шинэчилнэ.", "No data yet. It updates every hour.")}</p>}
          </Link>
        );
      })}
    </div>
  );
}
