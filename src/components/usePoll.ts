"use client";
import { useEffect, useRef } from "react";

/**
 * Runs `fn` now and again `ms` after each run finishes, so requests never overlap. Nothing runs while
 * the tab is hidden; coming back to it runs once at once and picks the rhythm up again. `enabled: false`
 * stops it entirely (no robot, no plan).
 */
export function usePoll(fn: () => Promise<unknown> | void, ms: number, enabled = true, runFirst = true) {
  const latest = useRef(fn);
  useEffect(() => { latest.current = fn; }, [fn]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true, busy = false, timer: number | undefined;
    const run = async () => {
      window.clearTimeout(timer);
      if (!alive || busy || document.hidden) return;
      busy = true;
      try { await latest.current(); } catch { /* the next round tries again */ }
      busy = false;
      if (alive && !document.hidden) timer = window.setTimeout(run, ms);
    };
    const onVisible = () => { if (!document.hidden) void run(); };
    if (runFirst) void run(); else timer = window.setTimeout(run, ms);
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [ms, enabled, runFirst]);
}
