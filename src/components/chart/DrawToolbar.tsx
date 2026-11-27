"use client";
import { useEffect, useRef, useState } from "react";
import { DRAW_COLORS, parseDrawings, type DrawColor, type DrawKind, type Drawing } from "@/lib/chartDraw";
import type { T } from "@/lib/i18n";
import { useViewer } from "../PrefsProvider";
import { COLOR } from "./DrawingLayer";

/** The member's drawings: loaded once, saved a moment after each change. */
export function useDrawings() {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const loaded = useRef(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/drawings", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!alive) return;
      if (j) setDrawings(parseDrawings(j.drawings));
      loaded.current = true;
    }).catch(() => { loaded.current = true; });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    const id = window.setTimeout(() => {
      void fetch("/api/drawings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ drawings }) }).catch(() => {});
    }, 700);
    return () => window.clearTimeout(id);
  }, [drawings]);
  return [drawings, setDrawings] as const;
}

const ICON: Record<DrawKind, string> = {
  trend: "M4 20 20 4M4 20a1.5 1.5 0 1 0 0-.01M20 4a1.5 1.5 0 1 0 0-.01",
  ray: "M4 18 21 7M4 18a1.5 1.5 0 1 0 0-.01",
  hline: "M3 12h18M7 12a1.5 1.5 0 1 0 0-.01",
  rect: "M4 6h16v12H4z",
  fib: "M4 5h16M4 9.5h16M4 13h16M4 16h16M4 19h16",
  text: "M5 6V5h14v1M12 5v14M9 19h6",
  long: "M4 4h16v8H4zM4 12h16v7H4zM8 8l4-3 4 3",
  short: "M4 4h16v7H4zM4 11h16v9H4zM8 16l4 3 4-3",
};
export function toolName(k: DrawKind, t: T): string {
  return {
    trend: t("Trend line", "Trend line"), ray: "Ray", hline: t("Хэвтээ шугам", "Horizontal line"), rect: t("Бүс (тэгш өнцөгт)", "Zone (rectangle)"),
    fib: "Fibonacci", text: t("Текст", "Text"), long: t("Long position (BUY төлөвлөгөө)", "Long position (BUY plan)"), short: t("Short position (SELL төлөвлөгөө)", "Short position (SELL plan)"),
  }[k];
}

/** The tools down the side of the chart (across the top on a phone): pick one, then the magnet, colour, delete and clear. */
export function DrawToolbar({ tool, setTool, magnetOn, setMagnet, color, setColor, selected, onDelete, onClear, count }: {
  tool: DrawKind | null; setTool: (k: DrawKind | null) => void; magnetOn: boolean; setMagnet: (b: boolean) => void;
  color: DrawColor; setColor: (c: DrawColor) => void; selected: boolean; onDelete: () => void; onClear: () => void; count: number;
}) {
  const { t } = useViewer();
  const [sure, setSure] = useState(false);
  const btn = (on: boolean) => `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${on ? "bg-amber-400/20 text-amber-200" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"}`;
  const icon = (d: string) => <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
  return (
    <div role="toolbar" aria-label={t("Зурах хэрэгсэл", "Drawing tools")} className="flex shrink-0 gap-1 overflow-x-auto border-zinc-800 p-1.5 sm:flex-col sm:overflow-visible sm:border-r">
      <button type="button" className={btn(tool === null)} onClick={() => setTool(null)} title={t("Сонгох / чарт гүйлгэх", "Select / move the chart")} aria-pressed={tool === null}>
        {icon("M5 3l12 9-5 1 3 6-2 1-3-6-4 3z")}
      </button>
      {(Object.keys(ICON) as DrawKind[]).map((k) => (
        <button key={k} type="button" className={btn(tool === k)} onClick={() => setTool(tool === k ? null : k)} title={toolName(k, t)} aria-label={toolName(k, t)} aria-pressed={tool === k}>{icon(ICON[k])}</button>
      ))}
      <span aria-hidden className="mx-1 w-px shrink-0 bg-zinc-800 sm:mx-0 sm:my-1 sm:h-px sm:w-auto" />
      <button type="button" className={btn(magnetOn)} onClick={() => setMagnet(!magnetOn)} aria-pressed={magnetOn} title={t("Magnet: лааны high/low/open/close руу наалдана", "Magnet: snaps to the candle's high, low, open or close")} aria-label="Magnet">
        {icon("M6 4v7a6 6 0 0 0 12 0V4h-4v7a2 2 0 0 1-4 0V4zM6 8h4M14 8h4")}
      </button>
      <div className="flex shrink-0 gap-1 sm:flex-col sm:items-center" role="group" aria-label={t("Өнгө", "Colour")}>
        {DRAW_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => setColor(c)} aria-pressed={color === c} aria-label={c} title={c}
            className={`m-1 h-4 w-4 rounded-full ${color === c ? "ring-2 ring-zinc-100 ring-offset-2 ring-offset-zinc-900" : ""}`} style={{ background: COLOR[c] }} />
        ))}
      </div>
      <button type="button" className={btn(false)} onClick={onDelete} disabled={!selected} title={t("Сонгосныг устгах (Delete)", "Delete the selected drawing (Delete)")} aria-label={t("Сонгосныг устгах", "Delete selected")}>
        <span className={selected ? "" : "opacity-30"}>{icon("M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12")}</span>
      </button>
      {count > 0 && (
        <button type="button" className={`${btn(sure)} text-[10px] font-bold`} onClick={() => { if (sure) { onClear(); setSure(false); } else { setSure(true); window.setTimeout(() => setSure(false), 3000); } }}
          title={sure ? t("Дахин дарвал бүгд устна", "Press again to remove all") : t("Бүх зургийг арилгах", "Remove all drawings")} aria-label={t("Бүх зургийг арилгах", "Remove all drawings")}>
          {sure ? "OK?" : icon("M4 4l16 16M20 4 4 20")}
        </button>
      )}
    </div>
  );
}
