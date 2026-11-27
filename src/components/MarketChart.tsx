"use client";
import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, LineSeries, type UTCTimestamp } from "lightweight-charts";
import { ema } from "@/lib/analysis/indicators";
import { zoneShiftMs } from "@/lib/time";
import { useViewer } from "./PrefsProvider";

export type ChartBar = { time: number; open: number; high: number; low: number; close: number };

/** One instrument's hourly bars with the 50-hour EMA, on the reader's clock. */
export function MarketChart({ bars, digits, label }: { bars: ChartBar[]; digits: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const v = useViewer();
  useEffect(() => {
    const el = box.current;
    if (!el || !bars.length) return;
    const css = getComputedStyle(document.documentElement);
    const c = (n: string) => css.getPropertyValue(n).trim();
    const up = c("--color-emerald-500"), down = c("--color-red-500"), edge = c("--color-zinc-800");
    const ch = createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: c("--color-zinc-400"), fontFamily: c("--font-sans") || "system-ui, sans-serif", attributionLogo: false },
      grid: { vertLines: { color: c("--chart-grid") }, horzLines: { color: c("--chart-grid") } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: edge, rightOffset: 4 },
      rightPriceScale: { borderColor: edge },
    });
    const at = (ms: number) => ((ms + zoneShiftMs(new Date(ms), v.timeZone)) / 1000) as UTCTimestamp;
    const fmt = { type: "price" as const, precision: digits, minMove: 10 ** -digits };
    const series = ch.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down, priceFormat: fmt });
    series.setData(bars.map((b) => ({ time: at(b.time), open: b.open, high: b.high, low: b.low, close: b.close })));
    const e = ema(bars.map((b) => b.close), 50);
    const line = ch.addSeries(LineSeries, { color: c("--color-amber-300"), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat: fmt });
    line.setData(bars.flatMap((b, i) => (i >= 49 && Number.isFinite(e[i]) ? [{ time: at(b.time), value: e[i] }] : [])));
    ch.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 150), to: bars.length + 4 });
    return () => ch.remove();
  }, [bars, digits, v.timeZone]);
  return <div ref={box} role="img" aria-label={label} className="h-[340px] w-full sm:h-[420px]" />;
}
