"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, LineSeries, type UTCTimestamp } from "lightweight-charts";
import { ema, type Timeframe } from "@/lib/analysis/indicators";
import type { Levels } from "@/lib/snapshot";
import { useViewer } from "./PrefsProvider";
import type { T } from "@/lib/i18n";
import { zoneShiftMs } from "@/lib/time";

const tfs = (t: T): [Timeframe, string][] => [["15min", t("15м", "15m")], ["1h", t("1ц", "1h")], ["4h", t("4ц", "4h")], ["1day", t("Өдөр", "Day")]];
type Row = { time: number; open: number; high: number; low: number; close: number };

/** Changes whenever the page switches between dark and light, so the canvas can be redrawn in the new colours. */
function useThemeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const seen = new MutationObserver(bump);
    seen.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const device = window.matchMedia("(prefers-color-scheme: light)");
    device.addEventListener("change", bump);
    return () => { seen.disconnect(); device.removeEventListener("change", bump); };
  }, []);
  return tick;
}

export function CandleChart({ levels }: { levels: Levels | null }) {
  const { t, zone, timeZone } = useViewer();
  const TFS = tfs(t);
  const themeTick = useThemeTick();
  const ref = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState<Timeframe>("1h");
  const [status, setStatus] = useState<"loading" | "empty" | "error" | "ok">("loading");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    // The chart paints on a canvas, so it takes the theme's colours as values rather than classes.
    const css = getComputedStyle(document.documentElement);
    const c = (name: string) => css.getPropertyValue(name).trim();
    const up = c("--color-emerald-500"), down = c("--color-red-500"), muted = c("--color-zinc-400"), edge = c("--color-zinc-800");
    const cross = { color: c("--color-zinc-600"), labelBackgroundColor: c("--color-zinc-700") };
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: muted, fontFamily: c("--font-sans") || "system-ui, sans-serif" },
      grid: { vertLines: { color: c("--chart-grid") }, horzLines: { color: c("--chart-grid") } },
      crosshair: { vertLine: cross, horzLine: cross },
      timeScale: { timeVisible: true, borderColor: edge },
      rightPriceScale: { borderColor: edge },
    });
    setStatus("loading");
    fetch(`/api/candles?tf=${tf}&limit=500`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(({ candles }: { candles: Row[] }) => {
        if (cancelled) return;
        if (candles.length === 0) return setStatus("empty");
        const at = (ms: number) => Math.floor((ms + zoneShiftMs(new Date(ms), timeZone)) / 1000) as UTCTimestamp; // the axis shows the viewer's clock
        const series = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down });
        series.setData(candles.map((c) => ({ time: at(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
        const closes = candles.map((c) => c.close);
        for (const [period, color] of [[20, c("--color-amber-400")], [50, c("--chart-ema50")], [200, c("--chart-ema200")]] as const) {
          const values = ema(closes, period);
          const line = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
          line.setData(candles.map((c, i) => ({ time: at(c.time), value: values[i] })).filter((p) => !Number.isNaN(p.value)));
        }
        if (levels) {
          for (const [title, price, color] of [["R1", levels.r1, down], ["Pivot", levels.p, muted], ["S1", levels.s1, up]] as const) {
            series.createPriceLine({ price, title, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
          }
        }
        chart.timeScale().fitContent();
        setStatus("ok");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => { cancelled = true; chart.remove(); };
  }, [tf, levels, timeZone, themeTick]);

  const keys: [string, string][] = [["EMA20", "var(--color-amber-400)"], ["EMA50", "var(--chart-ema50)"], ["EMA200", "var(--chart-ema200)"]];
  const levelKeys: [string, string][] = [["R1", "var(--color-red-500)"], ["Pivot", "var(--color-zinc-400)"], ["S1", "var(--color-emerald-500)"]];
  return (
    <div className="card px-0 pb-3 sm:px-0 sm:pb-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-3 px-4 sm:px-5">
        <div role="group" aria-label={t("Цагийн хүрээ", "Timeframe")} className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          {TFS.map(([v, label]) => (
            <button key={v} onClick={() => setTf(v)} aria-pressed={tf === v}
              className={`min-h-10 min-w-12 rounded-md px-3 text-sm tabular-nums transition-colors ${tf === v ? "bg-[var(--accent-bg)] font-semibold text-[var(--accent-fg)]" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"}`}>{label}</button>
          ))}
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-400 sm:ml-auto">
          {keys.map(([name, color]) => <li key={name} className="flex items-center gap-1.5"><span aria-hidden className="h-[5px] w-4 rounded-full" style={{ background: color }} />{name}</li>)}
          {levelKeys.map(([name, color]) => <li key={name} className="flex items-center gap-1.5"><span aria-hidden className="w-4 border-t-2 border-dashed" style={{ borderColor: color }} />{name}</li>)}
        </ul>
      </div>
      <div className="relative h-[58dvh] max-h-[620px] min-h-[340px] border-y border-zinc-800">
        <div ref={ref} className="absolute inset-0" />
        {status !== "ok" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 px-6 text-center text-sm text-zinc-500">
            {status !== "error" && <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />}
            {status === "loading" ? t("Ачаалж байна…", "Loading…") : status === "empty" ? t("Дата ачаалж байна", "Loading data") : t("Чартын дата татаж чадсангүй. Хуудсаа дахин ачаална уу.", "Could not load chart data. Reload the page.")}
          </div>
        )}
      </div>
      <p className="mt-3 px-4 text-xs text-zinc-500 sm:px-5">{t(`Цаг ${zone}-аар. Ногоон лаа өссөн, улаан лаа унасан.`, `Times in ${zone}. Green candles closed up, red candles closed down.`)}</p>
    </div>
  );
}
