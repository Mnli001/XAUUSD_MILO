"use client";
import { useSyncExternalStore } from "react";
import type { Quote } from "./liveBar";

/*
 * One poll for the whole page: every component that shows the live price reads the same quote, so
 * the header, the big figure and the chart never disagree and the server is asked once.
 */
const LIVE_MS = 2000; // while the feed is live
const IDLE_MS = 10_000; // while it is not (the stored candle only changes every 5 minutes)

let quote: Quote | null = null;
let timer: number | null = null;
const listeners = new Set<() => void>();

async function poll() {
  try {
    const res = await fetch("/api/live", { cache: "no-store" });
    if (res.ok) {
      const data: { quote: Quote | null } = await res.json();
      const next = data.quote;
      if (next?.price !== quote?.price || next?.at !== quote?.at || next?.live !== quote?.live) {
        quote = next;
        listeners.forEach((l) => l());
      }
    }
  } catch { /* offline: the next round tries again */ }
  schedule();
}

function schedule() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (listeners.size === 0 || document.visibilityState === "hidden") return;
  timer = window.setTimeout(poll, quote?.live ? LIVE_MS : IDLE_MS);
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", wake);
    void poll();
  }
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) {
      document.removeEventListener("visibilitychange", wake);
      if (timer !== null) clearTimeout(timer);
      timer = null;
    }
  };
}
const wake = () => { if (document.visibilityState === "visible") void poll(); };

/** The newest quote, or null before the first answer (and on the server). */
export const useQuote = (): Quote | null => useSyncExternalStore(subscribe, () => quote, () => null);
