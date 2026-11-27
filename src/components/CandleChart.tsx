"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createChart, createSeriesMarkers, CandlestickSeries, LineSeries, type IChartApi, type ISeriesApi, type IPriceLine, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp } from "lightweight-charts";
import { ema } from "@/lib/analysis/indicators";
import type { Levels } from "@/lib/snapshot";
import { useViewer } from "./PrefsProvider";
import { zoneShiftMs } from "@/lib/time";
import { useQuote } from "@/lib/liveClient";
import { withLive } from "@/lib/liveBar";
import { CHART_TFS, CHART_TF_LABEL, CHART_TF_MS, snapToBars, type ChartTf } from "@/lib/chartTf";
import type { BotChartData } from "@/lib/botChart";
import { LiveBadge } from "./LiveQuote";
import { DrawingLayer, type Plan } from "./chart/DrawingLayer";
import { DrawToolbar, useDrawings } from "./chart/DrawToolbar";
import type { DrawColor, DrawKind } from "@/lib/chartDraw";

type Row = { time: number; open: number; high: number; low: number; close: number };
const TF_KEY = "xau.chart.tf";
const px = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;

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

type Drawn = {
  chart: IChartApi; series: ISeriesApi<"Candlestick">; emas: ISeriesApi<"Line">[]; markers: ISeriesMarkersPluginApi<Time>;
  rows: Row[]; tf: ChartTf; at: (ms: number) => UTCTimestamp; colors: { up: string; down: string; muted: string };
};

/**
 * The live gold chart, M1 to W1. Draws the robot's own trades on it (an arrow where it entered, a dot where it
 * closed, coloured by the result) and its open positions with their stop and target. `focus` scrolls to a moment.
 */
/** A pending order (or any other price to mark) drawn as a dashed line. */
export type ChartLine = { price: number; title: string; tone: "up" | "down" | "muted" };
const NO_LINES: ChartLine[] = [];

export function CandleChart({ levels, bot, focus, owner = "bot", lines: extra = NO_LINES, onPickPrice, onPlan }: {
  levels: Levels | null; bot: BotChartData | null; focus?: { at: number; n: number } | null;
  /** Whose trades `bot` holds: the MT5 robot's, or the member's own demo trades. */
  owner?: "bot" | "demo";
  lines?: ChartLine[];
  /** Called with the price under a click on the chart (the demo order ticket takes it as the order's price). */
  onPickPrice?: (price: number) => void;
  /** A long/short plan drawn on the chart, sent to the order ticket (Demo trade). */
  onPlan?: (plan: Plan) => void;
}) {
  const { t, zone, timeZone } = useViewer();
  const themeTick = useThemeTick();
  const ref = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState<ChartTf>("1h");
  const [status, setStatus] = useState<"loading" | "empty" | "error" | "ok">("loading");
  const [drawnAt, setDrawnAt] = useState(0); // bumps when a chart is ready, so the overlays redraw on it
  const [show, setShow] = useState({ ema: true, levels: true, trades: true });
  const [hover, setHover] = useState<Row | null>(null);
  const [lastBar, setLastBar] = useState<Row | null>(null);
  const quote = useQuote();
  const drawn = useRef<Drawn | null>(null);
  const lines = useRef<IPriceLine[]>([]);
  const [drawings, setDrawings] = useDrawings();
  const [tool, setTool] = useState<DrawKind | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [magnetOn, setMagnet] = useState(true);
  const [color, setColorState] = useState<DrawColor>("amber");
  const setColor = (c: DrawColor) => { setColorState(c); if (selected) setDrawings((ds) => ds.map((d) => (d.id === selected ? { ...d, color: c } : d))); };
  const getHandle = useCallback(() => {
    const d = drawn.current;
    return d ? { chart: d.chart, series: d.series, rows: d.rows, step: CHART_TF_MS[d.tf] } : null;
  }, []);
  const pickRef = useRef(onPickPrice);
  useEffect(() => { pickRef.current = onPickPrice; }, [onPickPrice]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TF_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount: storage is not there during server render
      if (saved && (CHART_TFS as readonly string[]).includes(saved)) setTf(saved as ChartTf);
    } catch { /* storage unavailable */ }
  }, []);
  const pick = (next: ChartTf) => { setTf(next); try { localStorage.setItem(TF_KEY, next); } catch { /* storage unavailable */ } };

  // The chart itself: rebuilt for a new timeframe, time zone or theme.
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
      layout: { background: { color: "transparent" }, textColor: muted, fontFamily: c("--font-sans") || "system-ui, sans-serif", attributionLogo: false },
      grid: { vertLines: { color: c("--chart-grid") }, horzLines: { color: c("--chart-grid") } },
      crosshair: { vertLine: cross, horzLine: cross },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: edge, rightOffset: 6 },
      rightPriceScale: { borderColor: edge, scaleMargins: { top: 0.08, bottom: 0.08 } },
    });
    setStatus("loading");
    setHover(null);
    setLastBar(null);
    fetch(`/api/candles?tf=${tf}&limit=600`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(({ candles }: { candles: Row[] }) => {
        if (cancelled) return;
        if (candles.length === 0) return setStatus("empty");
        const at = (ms: number) => Math.floor((ms + zoneShiftMs(new Date(ms), timeZone)) / 1000) as UTCTimestamp; // the axis shows the viewer's clock
        const series = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down, priceLineColor: c("--color-amber-400") });
        series.setData(candles.map((k) => ({ time: at(k.time), open: k.open, high: k.high, low: k.low, close: k.close })));
        const closes = candles.map((k) => k.close);
        const emas = ([[20, c("--color-amber-400")], [50, c("--chart-ema50")], [200, c("--chart-ema200")]] as const).map(([period, color]) => {
          const values = ema(closes, period);
          const line = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
          line.setData(candles.map((k, i) => ({ time: at(k.time), value: values[i] })).filter((p) => !Number.isNaN(p.value)));
          return line;
        });
        const markers = createSeriesMarkers(series, []);
        // About one bar per 9 px (60 on a phone, 120 on a laptop), not all 600: older ones are a scroll away.
        const visible = Math.max(40, Math.min(160, Math.round(el.clientWidth / 9)));
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - visible), to: candles.length + 6 });
        // The legend follows the crosshair; off the chart it shows the newest bar.
        const byTime = new Map(candles.map((k) => [at(k.time) as number, k]));
        chart.subscribeCrosshairMove((p) => {
          const k = p.time === undefined ? null : byTime.get(p.time as number) ?? null;
          setHover(k);
        });
        chart.subscribeClick((p) => {
          if (!p.point || !pickRef.current) return;
          const price = series.coordinateToPrice(p.point.y);
          if (price !== null && Number.isFinite(price)) pickRef.current(Math.round(price * 100) / 100);
        });
        drawn.current = { chart, series, emas, markers, rows: candles, tf, at, colors: { up, down, muted } };
        setLastBar(candles[candles.length - 1]);
        lines.current = [];
        setStatus("ok");
        setDrawnAt((n) => n + 1);
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => { cancelled = true; drawn.current = null; chart.remove(); };
  }, [tf, timeZone, themeTick]);

  // Overlays on the drawn chart: EMAs, today's levels, the robot's trades and open positions.
  useEffect(() => {
    const d = drawn.current;
    if (!d) return;
    for (const line of d.emas) line.applyOptions({ visible: show.ema });
    for (const l of lines.current) d.series.removePriceLine(l);
    lines.current = [];
    const add = (o: Parameters<typeof d.series.createPriceLine>[0]) => lines.current.push(d.series.createPriceLine(o));
    if (levels && show.levels) {
      for (const [title, price, color] of [["R1", levels.r1, d.colors.down], ["Pivot", levels.p, d.colors.muted], ["S1", levels.s1, d.colors.up]] as const) {
        add({ price, title, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
      }
    }
    const marks: SeriesMarker<Time>[] = [];
    if (bot && show.trades) {
      const opens = d.rows.map((r) => r.time);
      const step = CHART_TF_MS[d.tf];
      // Several trades in one bar (a long timeframe) become one mark: the count and the net result.
      const exits = new Map<number, { pnl: number; n: number; price: number }>();
      const entries = new Map<string, { n: number; price: number; side: "BUY" | "SELL"; bar: number }>();
      for (const tr of bot.trades) {
        const xb = snapToBars(Date.parse(tr.closedAt), opens, step);
        if (xb !== null) { const e = exits.get(xb) ?? { pnl: 0, n: 0, price: tr.closePrice }; e.pnl += tr.profit; e.n++; exits.set(xb, e); }
        const eb = tr.openedAt ? snapToBars(Date.parse(tr.openedAt), opens, step) : null;
        if (eb !== null) { const k = `${eb}|${tr.side}`; const e = entries.get(k) ?? { n: 0, price: tr.openPrice, side: tr.side, bar: eb }; e.n++; entries.set(k, e); }
      }
      for (const e of entries.values()) {
        const buy = e.side === "BUY";
        marks.push({ time: d.at(e.bar), position: buy ? "atPriceBottom" : "atPriceTop", price: e.price, shape: buy ? "arrowUp" : "arrowDown", color: buy ? d.colors.up : d.colors.down, text: e.n > 1 ? `×${e.n}` : "", size: 1 });
      }
      for (const [bar, e] of exits) {
        marks.push({ time: d.at(bar), position: "atPriceMiddle", price: e.price, shape: "circle", color: e.pnl >= 0 ? d.colors.up : d.colors.down, text: e.n > 1 ? `×${e.n} ${usd(e.pnl)}` : usd(e.pnl), size: 1 });
      }
      for (const p of bot.open) {
        const buy = p.side === "BUY";
        add({ price: p.openPrice, title: `${p.side} ${p.lots} ${usd(p.profit)}`, color: buy ? d.colors.up : d.colors.down, lineWidth: 2, lineStyle: 0, axisLabelVisible: true });
        if (p.sl > 0) add({ price: p.sl, title: "SL", color: d.colors.down, lineWidth: 1, lineStyle: 1, axisLabelVisible: true });
        if (p.tp > 0) add({ price: p.tp, title: "TP", color: d.colors.up, lineWidth: 1, lineStyle: 1, axisLabelVisible: true });
      }
    }
    if (show.trades) {
      for (const l of extra) add({ price: l.price, title: l.title, color: l.tone === "up" ? d.colors.up : l.tone === "down" ? d.colors.down : d.colors.muted, lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
    }
    marks.sort((a, b) => (a.time as number) - (b.time as number));
    d.markers.setMarkers(marks);
  }, [drawnAt, levels, bot, show, extra]);

  // The bar still forming follows the live price; a new bar opens when its time comes.
  useEffect(() => {
    const d = drawn.current;
    if (!d || status !== "ok" || !quote?.live) return;
    const rows = withLive(d.rows, d.tf, quote.price, quote.at);
    if (rows === d.rows) return;
    d.rows = rows;
    const last = rows[rows.length - 1];
    try { d.series.update({ time: d.at(last.time), open: last.open, high: last.high, low: last.low, close: last.close }); } catch { /* the chart was rebuilt between the two effects */ }
    setLastBar(last);
  }, [quote, status]);

  // A trade picked in the history: scroll so it sits in view.
  useEffect(() => {
    const d = drawn.current;
    if (!d || !focus) return;
    const opens = d.rows.map((r) => r.time);
    const bar = snapToBars(focus.at, opens, CHART_TF_MS[d.tf]);
    const i = bar === null ? -1 : opens.indexOf(bar);
    if (i >= 0) d.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, i - 50), to: i + 30 });
  }, [focus, drawnAt]);

  const shown = hover ?? lastBar;
  const change = shown && shown.open ? ((shown.close - shown.open) / shown.open) * 100 : null;
  const keys: [string, string][] = [["EMA20", "var(--color-amber-400)"], ["EMA50", "var(--chart-ema50)"], ["EMA200", "var(--chart-ema200)"]];
  const toggle = (k: keyof typeof show, label: string, disabled = false) => (
    <button type="button" onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))} aria-pressed={show[k]} disabled={disabled}
      className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-40 ${show[k] ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-zinc-700 text-zinc-400 hover:text-zinc-200"}`}>{label}</button>
  );
  return (
    <div className="card px-0 pb-3 sm:px-0 sm:pb-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-3 px-4 sm:px-5">
        <div role="group" aria-label={t("Цагийн хүрээ", "Timeframe")} className="-mx-1 flex max-w-full overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-1">
          {CHART_TFS.map((v) => (
            <button key={v} type="button" onClick={() => pick(v)} aria-pressed={tf === v}
              style={tf === v ? { background: "var(--accent-bg)", color: "var(--accent-fg)" } : undefined}
              className={`min-h-10 min-w-11 shrink-0 rounded-lg px-2.5 text-sm tabular-nums transition-colors ${tf === v ? "font-bold" : "font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"}`}>{CHART_TF_LABEL[v]}</button>
          ))}
        </div>
        <LiveBadge />
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {toggle("ema", "EMA")}
          {toggle("levels", t("Түвшин", "Levels"), !levels)}
          {toggle("trades", owner === "demo" ? t("Миний арилжаа", "My trades") : t("Роботын арилжаа", "Robot trades"), !bot)}
        </div>
      </div>
      {/* The bar under the pointer (or the newest): open, high, low, close and its move. */}
      <p className="mb-2 flex min-h-5 flex-wrap gap-x-3 px-4 text-xs text-zinc-400 tabular-nums sm:px-5" aria-live="off">
        {shown && <>
          <span className="font-semibold text-zinc-200">XAUUSD · {CHART_TF_LABEL[tf]}</span>
          <span>O <b className="font-medium text-zinc-200">{px(shown.open)}</b></span>
          <span>H <b className="font-medium text-zinc-200">{px(shown.high)}</b></span>
          <span>L <b className="font-medium text-zinc-200">{px(shown.low)}</b></span>
          <span>C <b className="font-medium text-zinc-200">{px(shown.close)}</b></span>
          {change !== null && <span className={change > 0 ? "text-emerald-400" : change < 0 ? "text-red-400" : ""}>{change > 0 ? "+" : ""}{change.toFixed(2)}%</span>}
        </>}
      </p>
      <div className="flex flex-col border-y border-zinc-800 sm:flex-row">
      <DrawToolbar tool={tool} setTool={(k) => { setTool(k); if (k) setSelected(null); }} magnetOn={magnetOn} setMagnet={setMagnet} color={color} setColor={setColor}
        selected={selected !== null} onDelete={() => { setDrawings((ds) => ds.filter((d) => d.id !== selected)); setSelected(null); }}
        onClear={() => { setDrawings(() => []); setSelected(null); }} count={drawings.length} />
      <div className="relative h-[60dvh] max-h-[660px] min-h-[360px] min-w-0 flex-1">
        <div ref={ref} className="absolute inset-0" />
        {status === "ok" && <DrawingLayer getHandle={getHandle} version={drawnAt} tool={tool} setTool={setTool} drawings={drawings} setDrawings={setDrawings}
          selected={selected} setSelected={setSelected} magnetOn={magnetOn} color={color} onPlan={onPlan} />}
        {status !== "ok" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 px-6 text-center text-sm text-zinc-500">
            {status !== "error" && <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />}
            {status === "loading" ? t("Ачаалж байна…", "Loading…") : status === "empty" ? t("Дата ачаалж байна", "Loading data")
              : (tf === "1min" || tf === "5min") ? t("M1, M5-ын дата түр ирсэнгүй. Хэдэн минутын дараа дахин оролдоорой, эсвэл өөр хугацаа сонгоно уу.", "M1 and M5 data did not come through just now. Try again in a few minutes, or pick another timeframe.")
              : t("Чартын дата татаж чадсангүй. Хуудсаа дахин ачаална уу.", "Could not load chart data. Reload the page.")}
          </div>
        )}
      </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 text-xs text-zinc-500 sm:px-5">
        <span>{t(`Цаг ${zone}-аар.`, `Times in ${zone}.`)}</span>
        {show.ema && keys.map(([name, color]) => <span key={name} className="flex items-center gap-1.5"><span aria-hidden className="h-[5px] w-4 rounded-full" style={{ background: color }} />{name}</span>)}
        {bot && show.trades && <>
          <span className="flex items-center gap-1.5"><span aria-hidden className="text-emerald-400">▲</span><span aria-hidden className="text-red-400">▼</span>{owner === "demo" ? t("орсон", "entry") : t("робот орсон", "robot entry")}</span>
          <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-emerald-500" /><span aria-hidden className="h-2 w-2 rounded-full bg-red-500" />{t("хаасан, ашиг/алдагдал", "closed, profit/loss")}</span>
        </>}
      </div>
    </div>
  );
}
