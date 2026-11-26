"use client";
import { useCallback, useEffect, useRef } from "react";
import { playCue, soundEnabled, unlockSound } from "@/lib/sound";
import { usePoll } from "./usePoll";

const POLL_MS = 60_000;
const NEWS_LEAD_MS = 5 * 60_000;

/**
 * Listens on every signed-in page and plays a cue when a setup turns active, five minutes before a key
 * release and when it comes out. Nothing is drawn. It asks once a minute while the tab is in view (one
 * request at a time), and not at all while sound is switched off.
 */
export function LiveAlerts() {
  const seen = useRef<Set<string> | null>(null);
  const timers = useRef<number[]>([]);
  const scheduledFor = useRef<string | null>(null);

  useEffect(() => {
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const tick = useCallback(async () => {
    if (!soundEnabled()) { seen.current = null; return; } // nothing would be played
    const res = await fetch("/api/alerts", { cache: "no-store" });
    if (!res.ok) return;
    const data: { active: string[]; nextRelease: string | null } = await res.json();
    // The first read only learns what is already active, so opening a page is silent.
    if (seen.current) { if (data.active.some((a) => !seen.current!.has(a))) playCue("signal"); }
    seen.current = new Set(data.active);
    if (data.nextRelease && data.nextRelease !== scheduledFor.current) {
      scheduledFor.current = data.nextRelease;
      // One array for the component's life, emptied and refilled, so the unmount cleanup always sees the live timers.
      timers.current.splice(0).forEach(clearTimeout);
      const at = new Date(data.nextRelease).getTime() - Date.now();
      timers.current.push(...[at - NEWS_LEAD_MS, at].filter((ms) => ms > 0 && ms < 24 * 36e5).map((ms) => window.setTimeout(() => playCue("news"), ms)));
    }
  }, []);
  usePoll(tick, POLL_MS);
  return null;
}
