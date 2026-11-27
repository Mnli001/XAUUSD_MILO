"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Logical } from "lightweight-charts";
import {
  ONE_CLICK, fibLevels, logicalToTime, magnet, newPosition, positionStats, timeToLogical, type DrawColor, type DrawKind, type Drawing, type Pt,
} from "@/lib/chartDraw";
import { useViewer } from "../PrefsProvider";

export type ChartHandle = { chart: IChartApi; series: ISeriesApi<"Candlestick">; rows: { time: number; open: number; high: number; low: number; close: number }[]; step: number };
export type Plan = { side: "BUY" | "SELL"; entry: number; sl: number; tp: number };

export const COLOR: Record<DrawColor, string> = {
  amber: "var(--color-amber-400)", blue: "var(--color-sky-400)", green: "var(--color-emerald-400)", red: "var(--color-red-400)", white: "var(--color-zinc-100)",
};
const px = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Part = "a" | "b" | "c" | "all";
type XY = { x: number; y: number };

/**
 * The drawings over the chart, in an SVG laid on the canvas. Each point is a time and a price, turned into a
 * position on every redraw, so a line stays on its candles across zoom, scroll and timeframe. With a tool picked
 * the layer takes the clicks; otherwise only the drawings do (to select and drag them) and the chart pans as usual.
 */
export function DrawingLayer({ getHandle, version, tool, setTool, drawings, setDrawings, selected, setSelected, magnetOn, color, onPlan }: {
  getHandle: () => ChartHandle | null; version: number;
  tool: DrawKind | null; setTool: (k: DrawKind | null) => void;
  drawings: Drawing[]; setDrawings: (f: (d: Drawing[]) => Drawing[]) => void;
  selected: string | null; setSelected: (id: string | null) => void;
  magnetOn: boolean; color: DrawColor; onPlan?: (p: Plan) => void;
}) {
  const { t } = useViewer();
  const box = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ W: 0, H: 0 });
  const [draft, setDraft] = useState<Drawing | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const drag = useRef<{ id: string; part: Part; start: Pt; orig: Drawing } | null>(null);

  // Redraw when the chart scrolls, zooms, resizes or rescales.
  useEffect(() => {
    const h = getHandle();
    if (!h) return;
    let raf = 0;
    // Each redraw also measures the plot (the chart less its price and time axes).
    const bump = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = box.current;
        try {
          const W = el ? el.clientWidth - h.chart.priceScale("right").width() : 0, H = el ? el.clientHeight - h.chart.timeScale().height() : 0;
          setSize((s) => (s.W === W && s.H === H ? { ...s } : { W, H }));
        } catch { /* the chart is being rebuilt */ }
      });
    };
    const ts = h.chart.timeScale();
    // A click on the chart itself (not on a drawing, which takes its own clicks) lets go of the selection.
    const letGo = () => setSelected(null);
    h.chart.subscribeClick(letGo);
    ts.subscribeVisibleLogicalRangeChange(bump);
    ts.subscribeSizeChange(bump);
    h.chart.subscribeCrosshairMove(bump);
    const timer = window.setInterval(bump, 1000);
    bump();
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
      try { h.chart.unsubscribeClick(letGo); ts.unsubscribeVisibleLogicalRangeChange(bump); ts.unsubscribeSizeChange(bump); h.chart.unsubscribeCrosshairMove(bump); } catch { /* the chart is already gone */ }
    };
  }, [getHandle, version, setSelected]);

  const h = getHandle();
  const toXY = useCallback((p: Pt): XY | null => {
    const hh = getHandle();
    if (!hh) return null;
    const l = timeToLogical(p.t, hh.rows.map((r) => r.time), hh.step);
    const x = l === null ? null : hh.chart.timeScale().logicalToCoordinate(l as Logical);
    const y = hh.series.priceToCoordinate(p.p);
    return x === null || y === null ? null : { x, y };
  }, [getHandle]);

  const fromEvent = useCallback((e: { clientX: number; clientY: number }, snap: boolean): Pt | null => {
    const hh = getHandle(), el = box.current;
    if (!hh || !el) return null;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const l = hh.chart.timeScale().coordinateToLogical(x);
    const price = hh.series.coordinateToPrice(y);
    if (l === null || price === null) return null;
    const time = logicalToTime(l, hh.rows.map((row) => row.time), hh.step);
    if (time === null) return null;
    let p: number = price;
    if (snap) {
      const bar = hh.rows[Math.round(l)] ?? null;
      const below = hh.series.coordinateToPrice(y + 14);
      p = magnet(price, bar, below === null ? 0 : Math.abs(price - below));
    }
    return { t: Math.round(time), p: Math.round(p * 100) / 100 };
  }, [getHandle]);

  const update = useCallback((id: string, f: (d: Drawing) => Drawing) => setDrawings((ds) => ds.map((d) => (d.id === id ? f(d) : d))), [setDrawings]);

  // Dragging a drawing or one of its handles.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = drag.current;
      if (!g) return;
      const pt = fromEvent(e, magnetOn && g.part !== "all");
      if (!pt) return;
      const dt = pt.t - g.start.t, dp = Math.round((pt.p - g.start.p) * 100) / 100;
      const o = g.orig;
      const shift = (q?: Pt) => (q ? { t: q.t + dt, p: Math.round((q.p + dp) * 100) / 100 } : q);
      update(g.id, () => {
        if (g.part === "all") return { ...o, a: shift(o.a)!, b: shift(o.b), c: shift(o.c) };
        if (o.kind === "long" || o.kind === "short") {
          if (g.part === "a") return { ...o, a: pt, c: { t: pt.t, p: o.c!.p } };
          if (g.part === "b") return { ...o, b: pt };
          return { ...o, c: { t: o.a.t, p: pt.p } };
        }
        return { ...o, [g.part]: pt };
      });
    };
    const up = () => { drag.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [fromEvent, magnetOn, update]);

  // Escape lets go; Delete removes the selected drawing.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") { setDraft(null); setTool(null); setSelected(null); }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) { e.preventDefault(); setDrawings((ds) => ds.filter((d) => d.id !== selected)); setSelected(null); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected, setDrawings, setSelected, setTool]);

  const place = (e: React.PointerEvent) => {
    if (!tool) return;
    e.preventDefault();
    e.stopPropagation();
    const pt = fromEvent(e, magnetOn);
    const hh = getHandle();
    if (!pt || !hh) return;
    if (ONE_CLICK.has(tool)) {
      let d: Drawing;
      if (tool === "long" || tool === "short") {
        const y = hh.series.priceToCoordinate(pt.p) ?? 0;
        const far = hh.series.coordinateToPrice(y + 50);
        d = newPosition(tool, pt, Math.max(0.5, far === null ? 3 : Math.round(Math.abs(pt.p - far) * 100) / 100), hh.step);
      } else d = { id: crypto.randomUUID(), kind: tool, a: pt, color, ...(tool === "text" ? { text: "" } : {}) };
      setDrawings((ds) => [...ds, d]);
      setSelected(d.id);
      if (tool === "text") setEditing(d.id);
      setTool(null);
      return;
    }
    if (!draft) { setDraft({ id: crypto.randomUUID(), kind: tool, a: pt, b: pt, color }); return; }
    const done = { ...draft, b: pt };
    setDraft(null);
    if (Math.abs(done.a.t - pt.t) > 0 || Math.abs(done.a.p - pt.p) > 0) { setDrawings((ds) => [...ds, done]); setSelected(done.id); }
    setTool(null);
  };
  const hover = (e: React.PointerEvent) => {
    if (!draft) return;
    const pt = fromEvent(e, magnetOn);
    if (pt) setDraft({ ...draft, b: pt });
  };
  const grab = (d: Drawing, part: Part) => (e: React.PointerEvent) => {
    if (tool) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(d.id);
    const start = fromEvent(e, false);
    if (start) drag.current = { id: d.id, part, start, orig: d };
  };

  if (!h) return null;
  const { W, H } = size;

  const handle = (d: Drawing, part: Part, p: XY | null) => p && (
    <circle key={part} cx={p.x} cy={p.y} r={6} className="cursor-move" style={{ fill: "var(--color-zinc-950)", stroke: COLOR[d.color], strokeWidth: 2, pointerEvents: "all" }} onPointerDown={grab(d, part)} />
  );
  const label = (x: number, y: number, text: string, c: string, anchor: "start" | "end" = "end") => (
    <text x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="text-[11px] font-semibold" style={{ fill: c, paintOrder: "stroke", stroke: "var(--color-zinc-950)", strokeWidth: 3 }}>{text}</text>
  );

  function shape(d: Drawing, isDraft = false) {
    const c = COLOR[d.color];
    const a = toXY(d.a), b = d.b ? toXY(d.b) : null;
    const sel = !isDraft && d.id === selected;
    const sw = sel ? 2.5 : 1.75;
    const hit = { stroke: "transparent", strokeWidth: 14, pointerEvents: tool ? "none" : "stroke", cursor: "move" } as const;
    const on = isDraft ? {} : { onPointerDown: grab(d, "all") };
    if (!a) return null;
    switch (d.kind) {
      case "trend":
      case "ray": {
        if (!b) return null;
        let end = b;
        if (d.kind === "ray" && (b.x !== a.x || b.y !== a.y)) {
          const k = ((b.x >= a.x ? W : 0) - a.x) / (b.x - a.x || 1e-9);
          end = b.x === a.x ? { x: a.x, y: b.y > a.y ? H : 0 } : { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
        }
        return (
          <g key={d.id}>
            <line x1={a.x} y1={a.y} x2={end.x} y2={end.y} style={{ stroke: c, strokeWidth: sw }} />
            <line x1={a.x} y1={a.y} x2={end.x} y2={end.y} style={hit} {...on} />
            {sel && [handle(d, "a", a), handle(d, "b", b)]}
          </g>
        );
      }
      case "hline":
        return (
          <g key={d.id}>
            <line x1={0} y1={a.y} x2={W} y2={a.y} style={{ stroke: c, strokeWidth: sw }} />
            <line x1={0} y1={a.y} x2={W} y2={a.y} style={hit} {...on} />
            {label(W - 6, a.y - 9, px(d.a.p), c)}
          </g>
        );
      case "rect": {
        if (!b) return null;
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), hgt = Math.abs(b.y - a.y);
        return (
          <g key={d.id}>
            <rect x={x} y={y} width={w} height={hgt} style={{ fill: c, fillOpacity: 0.12, stroke: c, strokeWidth: sw, pointerEvents: tool ? "none" : "all", cursor: "move" }} {...on} />
            {sel && [handle(d, "a", a), handle(d, "b", b)]}
          </g>
        );
      }
      case "fib": {
        if (!b) return null;
        const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x) + 60;
        return (
          <g key={d.id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={{ stroke: c, strokeWidth: 1, strokeDasharray: "4 4" }} />
            {fibLevels(d.a.p, d.b!.p).map((lv) => {
              const y = h!.series.priceToCoordinate(lv.price);
              if (y === null) return null;
              return (
                <g key={lv.ratio}>
                  <line x1={x1} y1={y} x2={x2} y2={y} style={{ stroke: c, strokeWidth: lv.ratio === 0.618 || lv.ratio === 0.5 ? 1.75 : 1, strokeOpacity: lv.ratio === 0 || lv.ratio === 1 ? 1 : 0.8 }} />
                  <line x1={x1} y1={y} x2={x2} y2={y} style={hit} {...on} />
                  {label(x1 - 4, y, `${lv.ratio} (${px(lv.price)})`, c)}
                </g>
              );
            })}
            {sel && [handle(d, "a", a), handle(d, "b", b)]}
          </g>
        );
      }
      case "text":
        return (
          <g key={d.id}>
            <text x={a.x} y={a.y} dominantBaseline="middle" className="text-[13px] font-semibold" style={{ fill: c, paintOrder: "stroke", stroke: "var(--color-zinc-950)", strokeWidth: 3, pointerEvents: tool ? "none" : "all", cursor: "move" }}
              {...on} onDoubleClick={() => setEditing(d.id)}>{d.text || t("Текст", "Text")}</text>
            {sel && <rect x={a.x - 4} y={a.y - 11} width={Math.max(40, (d.text?.length ?? 4) * 7.5 + 8)} height={22} rx={4} style={{ fill: "none", stroke: c, strokeDasharray: "3 3", pointerEvents: "none" }} />}
          </g>
        );
      case "long":
      case "short": {
        const s = positionStats(d);
        const tp = toXY({ t: d.b!.t, p: s.tp }), sl = toXY({ t: d.a.t, p: s.sl });
        const end = toXY({ t: d.b!.t, p: s.entry });
        if (!tp || !sl || !end) return null;
        const x = Math.min(a.x, end.x), w = Math.max(8, Math.abs(end.x - a.x));
        const green = "var(--color-emerald-500)", red = "var(--color-red-500)";
        const flip = x + 210 > W; // near the price axis the labels run leftwards from the axis
        const lx = flip ? W - 6 : x + 6, la = flip ? "end" as const : "start" as const;
        const rect = (y1: number, y2: number, col: string) => <rect x={x} y={Math.min(y1, y2)} width={w} height={Math.abs(y2 - y1)} style={{ fill: col, fillOpacity: 0.16, pointerEvents: tool ? "none" : "all", cursor: "move" }} {...on} />;
        return (
          <g key={d.id}>
            {rect(a.y, tp.y, green)}
            {rect(a.y, sl.y, red)}
            <line x1={x} y1={a.y} x2={x + w} y2={a.y} style={{ stroke: "var(--color-zinc-300)", strokeWidth: 1.5 }} />
            {label(lx, tp.y + (tp.y < a.y ? 10 : -10), `TP ${px(s.tp)} · +${s.reward.toFixed(2)}`, green, la)}
            {label(lx, sl.y + (sl.y > a.y ? -10 : 10), `SL ${px(s.sl)} · −${s.risk.toFixed(2)}`, red, la)}
            {label(lx, a.y - 9, `${s.side} ${px(s.entry)} · R:R 1:${s.rr.toFixed(2)}`, "var(--color-zinc-100)", la)}
            {sel && [handle(d, "a", a), handle(d, "b", tp), handle(d, "c", sl)]}
          </g>
        );
      }
    }
  }

  const sel = drawings.find((d) => d.id === selected);
  const planAt = sel && (sel.kind === "long" || sel.kind === "short") && onPlan ? toXY(sel.a) : null;
  const edit = editing ? drawings.find((d) => d.id === editing) : null;
  const editAt = edit ? toXY(edit.a) : null;

  return (
    <>
      <svg ref={box} className="absolute inset-0 z-[5] h-full w-full" style={{ pointerEvents: tool ? "all" : "none", cursor: tool ? "crosshair" : undefined, touchAction: tool ? "none" : undefined }}
        onPointerDown={place} onPointerMove={hover}>
        <defs><clipPath id="plot"><rect x={0} y={0} width={Math.max(0, W)} height={Math.max(0, H)} /></clipPath></defs>
        <g clipPath="url(#plot)">
          {drawings.map((d) => shape(d))}
          {draft && shape(draft, true)}
        </g>
      </svg>
      {planAt && sel && (
        <button type="button" className="absolute z-10 rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-bold text-zinc-950 shadow"
          style={{ left: Math.min(planAt.x + 8, Math.max(0, W - 150)), top: Math.max(4, planAt.y + 14) }}
          onClick={() => { const s = positionStats(sel); onPlan!({ side: s.side, entry: s.entry, sl: s.sl, tp: s.tp }); }}>
          {t("Захиалга болгох", "Use as order")}
        </button>
      )}
      {edit && editAt && (
        <input autoFocus aria-label={t("Тэмдэглэл", "Note")} defaultValue={edit.text ?? ""} maxLength={120}
          className="absolute z-10 w-56 rounded-md border border-amber-400 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
          style={{ left: Math.min(editAt.x, Math.max(0, W - 230)), top: Math.max(0, editAt.y - 14) }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
          onBlur={(e) => {
            const text = e.target.value.trim();
            setEditing(null);
            if (!text) setDrawings((ds) => ds.filter((d) => d.id !== edit.id));
            else update(edit.id, (d) => ({ ...d, text }));
          }} />
      )}
    </>
  );
}
