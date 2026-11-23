"use client";
import { useEffect, useRef } from "react";
import { playCue, unlockSound } from "@/lib/sound";

const POLL_MS = 60_000;
const NEWS_LEAD_MS = 5 * 60_000;

/**
 * Listens in the background on every signed-in page and plays a cue when a setup turns active,
 * five minutes before a key release and when it comes out. Nothing is drawn.
 */
export function LiveAlerts() {
  const seen = useRef<Set<string> | null>(null);
  const timers = useRef<number[]>([]);
  const scheduledFor = useRef<string | null>(null);

  useEffect(() => {
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/alerts", { cache: "no-store" });
        if (!res.ok) return;
        const data: { active: string[]; nextRelease: string | null } = await res.json();
        // The first read only learns what is already active, so opening a page is silent.
        if (seen.current) { if (data.active.some((a) => !seen.current!.has(a))) playCue("signal"); }
        seen.current = new Set(data.active);
        if (data.nextRelease && data.nextRelease !== scheduledFor.current) {
          scheduledFor.current = data.nextRelease;
          timers.current.forEach(clearTimeout);
          const at = new Date(data.nextRelease).getTime() - Date.now();
          timers.current = [at - NEWS_LEAD_MS, at].filter((ms) => ms > 0 && ms < 24 * 36e5).map((ms) => window.setTimeout(() => playCue("news"), ms));
        }
      } catch { /* offline: try again on the next tick */ }
    };
    void tick();
    const id = window.setInterval(() => { if (!stop) void tick(); }, POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
      timers.current.forEach(clearTimeout);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  return null;
}
