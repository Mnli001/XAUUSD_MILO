"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, LineSeries, type UTCTimestamp } from "lightweight-charts";
import { ema, type Timeframe } from "@/lib/analysis/indicators";
import type { Levels } from "@/lib/snapshot";

const TFS: [Timeframe, string][] = [["15min", "15м"], ["1h", "1ц"], ["4h", "4ц"], ["1day", "Өдөр"]];
const UB_SHIFT = 8 * 3600; // the chart renders timestamps as UTC, so shift to show UB time
type Row = { time: number; open: number; high: number; low: number; close: number };

export function CandleChart({ levels }: { levels: Levels | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState<Timeframe>("1h");
  const [status, setStatus] = useState<"loading" | "empty" | "error" | "ok">("loading");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#a59e8c", fontFamily: "'Golos Text Variable', system-ui, sans-serif" },
      grid: { vertLines: { color: "#221f17" }, horzLines: { color: "#221f17" } },
      timeScale: { timeVisible: true, borderColor: "#3d382c" },
      rightPriceScale: { borderColor: "#3d382c" },
    });
    setStatus("loading");
    fetch(`/api/candles?tf=${tf}&limit=500`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(({ candles }: { candles: Row[] }) => {
        if (cancelled) return;
        if (candles.length === 0) return setStatus("empty");
        const t = (ms: number) => (Math.floor(ms / 1000) + UB_SHIFT) as UTCTimestamp;
        const series = chart.addSeries(CandlestickSeries, { upColor: "#2ea878", downColor: "#d44b3f", borderVisible: false, wickUpColor: "#2ea878", wickDownColor: "#d44b3f" });
        series.setData(candles.map((c) => ({ time: t(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
        const closes = candles.map((c) => c.close);
        for (const [period, color] of [[20, "#e3b44b"], [50, "#6ea8e0"], [200, "#b58ad6"]] as const) {
          const values = ema(closes, period);
          const line = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
          line.setData(candles.map((c, i) => ({ time: t(c.time), value: values[i] })).filter((p) => !Number.isNaN(p.value)));
        }
        if (levels) {
          for (const [title, price, color] of [["R1", levels.r1, "#d44b3f"], ["Pivot", levels.p, "#a59e8c"], ["S1", levels.s1, "#2ea878"]] as const) {
            series.createPriceLine({ price, title, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
          }
        }
        chart.timeScale().fitContent();
        setStatus("ok");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => { cancelled = true; chart.remove(); };
  }, [tf, levels]);

  return (
    <div className="card px-2 sm:px-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 px-2 sm:px-0">
        {TFS.map(([v, label]) => (
          <button key={v} onClick={() => setTf(v)} aria-pressed={tf === v}
            className={`min-h-10 min-w-12 rounded-lg px-3 text-sm ${tf === v ? "bg-amber-500 font-semibold text-zinc-950" : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}>{label}</button>
        ))}
        <span className="flex w-full flex-wrap gap-x-3 text-xs text-zinc-500 sm:ml-auto sm:w-auto"><span className="text-amber-400">EMA20</span><span className="text-[#6ea8e0]">EMA50</span><span className="text-[#b58ad6]">EMA200</span><span>цаг УБ-аар</span></span>
      </div>
      <div className="relative h-[58dvh] max-h-[620px] min-h-[340px]">
        <div ref={ref} className="absolute inset-0" />
        {status !== "ok" && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
            {status === "loading" ? "Ачаалж байна…" : status === "empty" ? "Дата ачаалж байна" : "Чартын дата татаж чадсангүй. Хуудсаа дахин ачаална уу."}
          </div>
        )}
      </div>
    </div>
  );
}
