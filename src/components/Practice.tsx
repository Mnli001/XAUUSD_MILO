"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useViewer } from "./PrefsProvider";
import { zoneShiftMs } from "@/lib/time";
import { atr } from "@/lib/analysis/indicators";
import { closeTrade, openTrade, stepTrades, summary, type Bar, type ClosedTrade, type PracticeTrade, type Side } from "@/lib/replay";

type Day = { day: string; context: Bar[]; replay: Bar[] };
const SPEEDS = [1, 2, 4] as const;
const px = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hhmm = (sec: number) => new Date(sec * 1000).toISOString().slice(11, 16);
const usd = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;

/**
 * Bar replay: a hidden past day plays bar by bar after the two days before it. Buy or sell at the close of the bar
 * on screen; trades settle on the next bars at their stop or target. The date is shown only when the day is over.
 */
export function Practice() {
  const { t, timeZone } = useViewer();
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<{ chart: IChartApi; series: ISeriesApi<"Candlestick"> } | null>(null);
  const lines = useRef<IPriceLine[]>([]);
  const [data, setData] = useState<Day | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ok">("loading");
  const [shown, setShown] = useState(0); // replay bars revealed
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [open, setOpen] = useState<PracticeTrade[]>([]);
  const [closed, setClosed] = useState<ClosedTrade[]>([]);
  const [stopUsd, setStopUsd] = useState("5");
  const [targetUsd, setTargetUsd] = useState("10");
  const nextId = useRef(1);

  const at = useCallback((ms: number) => Math.floor((ms + zoneShiftMs(new Date(ms), timeZone)) / 1000) as UTCTimestamp, [timeZone]);
  const done = !!data && shown >= data.replay.length;
  const current: Bar | null = data ? (shown > 0 ? data.replay[shown - 1] : data.context.at(-1) ?? null) : null;

  const load = useCallback(() => {
    setStatus("loading"); setPlaying(false); setShown(0); setOpen([]); setClosed([]);
    fetch("/api/replay", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Day) => {
        setData(d); setStatus("ok");
        // a stop of about 1.5 × the 15-minute ATR, and a target twice that
        const a = atr(d.context.map((b) => ({ ...b, time: new Date(b.time) })), 14);
        if (Number.isFinite(a) && a > 0) { const s = Math.max(1, Math.round(a * 1.5)); setStopUsd(String(s)); setTargetUsd(String(s * 2)); }
      })
      .catch(() => setStatus("error"));
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the first day is fetched once the page is in the browser
  useEffect(() => { load(); }, [load]);

  // the chart is made once and given the bars as they are revealed
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const c = (n: string) => css.getPropertyValue(n).trim();
    const up = c("--color-emerald-500"), down = c("--color-red-500"), edge = c("--color-zinc-800");
    const ch = createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: c("--color-zinc-400"), fontFamily: c("--font-sans") || "system-ui, sans-serif", attributionLogo: false },
      grid: { vertLines: { color: c("--chart-grid") }, horzLines: { color: c("--chart-grid") } },
      // only the clock on the axis and the crosshair: a date there would give the hidden day away
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: edge, rightOffset: 8, tickMarkFormatter: (time: UTCTimestamp) => hhmm(time) },
      localization: { timeFormatter: (time: UTCTimestamp) => hhmm(time) },
      rightPriceScale: { borderColor: edge },
    });
    const series = ch.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down });
    chart.current = { chart: ch, series };
    return () => { ch.remove(); chart.current = null; };
  }, []);

  useEffect(() => {
    const ch = chart.current;
    if (!ch || !data) return;
    const bars = [...data.context, ...data.replay.slice(0, shown)];
    ch.series.setData(bars.map((b) => ({ time: at(b.time), open: b.open, high: b.high, low: b.low, close: b.close })));
    if (shown === 0) ch.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 120), to: bars.length + 8 });
  }, [data, shown, at]);

  // stop, target and entry lines for the open trades
  useEffect(() => {
    const ch = chart.current;
    if (!ch) return;
    for (const l of lines.current) ch.series.removePriceLine(l);
    const css = getComputedStyle(document.documentElement);
    const up = css.getPropertyValue("--color-emerald-500").trim(), down = css.getPropertyValue("--color-red-500").trim();
    lines.current = open.flatMap((tr) => [
      ch.series.createPriceLine({ price: tr.entry, title: tr.side, color: tr.side === "BUY" ? up : down, lineWidth: 2, lineStyle: 0, axisLabelVisible: true }),
      ch.series.createPriceLine({ price: tr.stop, title: "SL", color: down, lineWidth: 1, lineStyle: 1, axisLabelVisible: true }),
      ch.series.createPriceLine({ price: tr.target, title: "TP", color: up, lineWidth: 1, lineStyle: 1, axisLabelVisible: true }),
    ]);
  }, [open]);

  const step = useCallback(() => {
    if (!data || shown >= data.replay.length) return;
    const bar = data.replay[shown];
    const r = stepTrades(open, bar);
    let still = r.open, ended = r.closed;
    if (shown + 1 >= data.replay.length) { ended = [...ended, ...still.map((tr) => closeTrade(tr, bar.close, bar.time, "MANUAL"))]; still = []; setPlaying(false); }
    setOpen(still);
    if (ended.length) setClosed((c) => [...c, ...ended]);
    setShown(shown + 1);
  }, [data, shown, open]);

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(step, 1000 / speed);
    return () => clearTimeout(id);
  }, [playing, speed, step]);

  const trade = useCallback((side: Side) => {
    if (!current || done) return;
    const s = Number(stopUsd), tg = Number(targetUsd);
    if (!(s > 0) || !(tg > 0)) return;
    setOpen((o) => [...o, openTrade(side, current, s, tg, nextId.current++)]);
  }, [current, done, stopUsd, targetUsd]);
  const closeNow = (id: number) => {
    const tr = open.find((x) => x.id === id);
    if (!tr || !current) return;
    setOpen(open.filter((x) => x.id !== id));
    setClosed((c) => [...c, closeTrade(tr, current.close, current.time, "MANUAL")]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, select, textarea")) return;
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === "ArrowRight") { e.preventDefault(); step(); }
      else if (e.key === "b" || e.key === "B") trade("BUY");
      else if (e.key === "s" || e.key === "S") trade("SELL");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, trade]);

  const s = summary(closed);
  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="card p-0 overflow-hidden" aria-label={t("Дасгалын график", "Practice chart")}>
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <span className="text-sm font-semibold text-zinc-100">XAUUSD M15</span>
          <span className="text-xs text-zinc-500 tabular-nums">{done && data ? t(`Өдөр: ${data.day}`, `Day: ${data.day}`) : t("Нууц өдөр", "Hidden day")}{data && ` · ${shown}/${data.replay.length}`}</span>
          {current && <span className="ms-auto text-sm font-semibold text-zinc-100 tabular-nums">{px(current.close)}</span>}
        </div>
        <div ref={box} className="h-[52vh] min-h-[320px] w-full" />
        {status === "loading" && <p className="px-4 py-3 text-sm text-zinc-500">{t("Өдөр ачаалж байна…", "Loading a day…")}</p>}
        {status === "error" && <p role="alert" className="px-4 py-3 text-sm text-red-300">{t("Өдөр ачаалж чадсангүй. Дахин оролдоно уу.", "Could not load a day. Try again.")}</p>}
        <div className="flex flex-wrap items-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button type="button" className="btn-ghost" onClick={() => setPlaying((p) => !p)} disabled={!data || done} aria-pressed={playing}>{playing ? t("Зогсоох", "Pause") : t("Тоглуулах", "Play")}</button>
          <button type="button" className="btn-ghost" onClick={step} disabled={!data || done}>{t("Дараагийн лаа", "Next bar")}</button>
          <div role="group" aria-label={t("Хурд", "Speed")} className="flex gap-1">
            {SPEEDS.map((x) => <button key={x} type="button" onClick={() => setSpeed(x)} aria-pressed={speed === x} className={`min-h-9 rounded-lg px-2.5 text-xs tabular-nums ${speed === x ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-100"}`}>{x}×</button>)}
          </div>
          <div className="w-20"><label className="label" htmlFor="pr-stop">{t("Stop ($)", "Stop ($)")}</label><input id="pr-stop" className="input tabular-nums" type="number" min="0.5" step="0.5" value={stopUsd} onChange={(e) => setStopUsd(e.target.value)} /></div>
          <div className="w-20"><label className="label" htmlFor="pr-target">{t("Target ($)", "Target ($)")}</label><input id="pr-target" className="input tabular-nums" type="number" min="0.5" step="0.5" value={targetUsd} onChange={(e) => setTargetUsd(e.target.value)} /></div>
          <button type="button" className="min-h-10 rounded-lg bg-emerald-500/90 px-4 text-sm font-semibold text-white disabled:opacity-40" onClick={() => trade("BUY")} disabled={!data || done}>BUY</button>
          <button type="button" className="min-h-10 rounded-lg bg-red-500/90 px-4 text-sm font-semibold text-white disabled:opacity-40" onClick={() => trade("SELL")} disabled={!data || done}>SELL</button>
          <button type="button" className="btn-ghost ms-auto" onClick={load}>{t("Шинэ өдөр", "New day")}</button>
        </div>
        <p className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">{t("Товч: Space тоглуулах/зогсоох · → дараагийн лаа · B авах · S зарах. Нэг лаа stop, target хоёуланд хүрвэл stop-оор тооцно. Мөнгийг 0.01 lot-оор тооцно.", "Keys: Space play/pause · → next bar · B buy · S sell. If one bar reaches both the stop and the target, the stop counts. Money is on 0.01 lot.")}</p>
      </section>

      <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
        <section className="card" aria-labelledby="pr-open">
          <h2 id="pr-open" className="card-title">{t("Нээлттэй арилжаа", "Open trades")}</h2>
          {open.length === 0 ? <p className="mt-2 text-sm text-zinc-500">{t("Одоогоор алга. BUY эсвэл SELL дарж орно.", "None yet. Press BUY or SELL to enter.")}</p> : (
            <ul className="mt-2 divide-y divide-zinc-800/80">
              {open.map((tr) => {
                const live = current ? (tr.side === "BUY" ? current.close - tr.entry : tr.entry - current.close) : 0;
                return (
                  <li key={tr.id} className="flex items-center justify-between gap-3 py-2 text-sm tabular-nums">
                    <span><b className={tr.side === "BUY" ? "text-emerald-400" : "text-red-300"}>{tr.side}</b> {px(tr.entry)} · SL {px(tr.stop)} · TP {px(tr.target)}</span>
                    <span className="flex items-center gap-2"><span className={live >= 0 ? "text-emerald-400" : "text-red-300"}>{usd(live)}</span><button type="button" className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={() => closeNow(tr.id)}>{t("Хаах", "Close")}</button></span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="card" aria-labelledby="pr-result">
          <h2 id="pr-result" className="card-title">{t("Энэ өдрийн үр дүн", "This day's result")}</h2>
          <p className="mt-2 text-2xl font-semibold text-zinc-50 tabular-nums">{s.totalR > 0 ? "+" : ""}{s.totalR}R <span className="text-base text-zinc-400">{usd(s.pnl)}</span></p>
          <p className="mt-1 text-xs text-zinc-500 tabular-nums">{t(`${s.trades} арилжаа · ${s.winPct ?? 0}% ашигтай`, `${s.trades} trades · ${s.winPct ?? 0}% profitable`)}</p>
          {closed.length > 0 && (
            <ul className="mt-3 max-h-56 divide-y divide-zinc-800/80 overflow-auto text-sm tabular-nums">
              {[...closed].reverse().map((c) => (
                <li key={c.id} className="flex justify-between gap-3 py-1.5"><span>{c.side} {px(c.entry)} → {px(c.exit)} <span className="text-xs text-zinc-500">{c.result === "WIN" ? "TP" : c.result === "LOSS" ? "SL" : t("гараар", "by hand")}</span></span><span className={c.pnl >= 0 ? "text-emerald-400" : "text-red-300"}>{c.r > 0 ? "+" : ""}{c.r}R</span></li>
              ))}
            </ul>
          )}
          {done && <p className="mt-3 text-sm text-zinc-300">{t("Өдөр дууслаа. “Шинэ өдөр” дарж дахин дасгал хийнэ.", "The day is over. Press “New day” to practise again.")}</p>}
        </section>
      </div>
    </div>
  );
}
