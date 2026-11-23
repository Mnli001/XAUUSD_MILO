"use client";
import { useEffect, useRef, useState } from "react";
import { useQuote } from "@/lib/liveClient";
import { useViewer } from "./PrefsProvider";
import { Dir } from "./Timetable";

const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** +1 / −1 for a moment after the price moves, so the figure can flash the way it went. */
function useFlash(price: number | undefined): number {
  const prev = useRef(price);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (price === undefined || prev.current === undefined || price === prev.current) { prev.current = price; return; }
    setFlash(price > prev.current ? 1 : -1);
    prev.current = price;
    const id = window.setTimeout(() => setFlash(0), 600);
    return () => clearTimeout(id);
  }, [price]);
  return flash;
}

/** Whether the price on screen is moving with MT5 right now, or is the last stored candle. */
export function LiveBadge({ className = "" }: { className?: string }) {
  const { t } = useViewer();
  const q = useQuote();
  if (!q) return null;
  return q.live ? (
    <span className={`glass-pill text-emerald-400 ${className}`} title={t("Үнэ MT5-аас 1–2 секунд тутам шинэчлэгдэж байна", "The price is refreshed from MT5 every second or two")}>
      <span aria-hidden className="live-dot" />{t("Шууд · MT5", "Live · MT5")}
    </span>
  ) : (
    <span className={`glass-pill text-zinc-400 ${className}`} title={t("MT5 холбогдоогүй үед 5 минут тутмын лааны үнэ харагдана", "With MT5 offline the price is the 5-minute candle refresh")}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-zinc-500" />{t("Шууд биш · лааны үнэ", "Not live · candle price")}
    </span>
  );
}

/**
 * The big price with its change and freshness. Drawn from what the server had when the page was
 * built, then kept moving by the live quote.
 */
export function LivePrice({ last, prevClose, updatedAt }: { last: number; prevClose: number | null; updatedAt: string }) {
  const { t, time, zone } = useViewer();
  const q = useQuote();
  const price = q?.price ?? last;
  const at = q ? new Date(q.at) : new Date(updatedAt);
  const flash = useFlash(q?.price);
  const pct = prevClose ? ((price - prevClose) / prevClose) * 100 : null;
  const up = (pct ?? 0) >= 0;
  const spread = q?.live && q.bid !== null && q.ask !== null ? q.ask - q.bid : null;
  return (
    <>
      <p className={`font-display mt-2 text-[52px] leading-none tabular-nums transition-colors duration-500 sm:text-[72px] ${flash > 0 ? "text-emerald-300" : flash < 0 ? "text-red-300" : "text-zinc-50"}`} aria-live="off">{money(price)}</p>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {pct !== null && (
          <span className={`rounded-full px-2.5 py-1 font-bold whitespace-nowrap tabular-nums ${up ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
            <Dir d={up ? 1 : -1} /> {up ? "+" : "−"}{Math.abs(pct).toFixed(2)}%
          </span>
        )}
        <LiveBadge />
        <span className="text-zinc-500">
          {q?.live ? t("Сүүлийн үнэ", "Last price") : t("Шинэчлэгдсэн", "Updated")} <span className="text-zinc-300 tabular-nums">{time(at)}</span> {zone}
          {spread !== null && <> · {t("зөрүү", "spread")} <span className="text-zinc-300 tabular-nums">${spread.toFixed(2)}</span></>}
        </span>
      </p>
    </>
  );
}
