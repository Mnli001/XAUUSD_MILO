"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useViewer } from "./PrefsProvider";

/**
 * Makes one element fill the screen: the browser's own fullscreen where it has one, otherwise (an iPhone) the
 * element covers the window. Escape, or the browser leaving fullscreen, brings it back. Spread `boxClass` on the
 * element: it gives the background and scrolling a full screen needs.
 */
export function useFullscreen<E extends HTMLElement>() {
  const ref = useRef<E>(null);
  const [full, setFull] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    const sync = () => {
      const on = !!ref.current && document.fullscreenElement === ref.current;
      setFull((was) => (native ? on : was));
      if (native && !on) setNative(false);
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [native]);

  useEffect(() => {
    if (!full || native) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", key);
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden"; // the page behind does not scroll
    return () => { window.removeEventListener("keydown", key); html.style.overflow = before; };
  }, [full, native]);

  const toggle = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    if (full) {
      if (native && document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setNative(false);
      setFull(false);
      return;
    }
    if (document.fullscreenEnabled && typeof el.requestFullscreen === "function") {
      try {
        setNative(true);
        await el.requestFullscreen();
        setFull(true);
        return;
      } catch { setNative(false); }
    }
    setFull(true);
  }, [full, native]);

  const boxClass = full ? `${native ? "" : "fixed inset-0 z-[70] "}overflow-y-auto bg-zinc-950 p-2 sm:p-4` : "";
  return { ref, full, toggle, boxClass };
}
export type Fullscreen = ReturnType<typeof useFullscreen<HTMLElement>>;

export function FullscreenButton({ fs }: { fs: { full: boolean; toggle: () => void } }) {
  const { t } = useViewer();
  const label = fs.full ? t("Жижигрүүлэх", "Exit full screen") : t("Бүтэн дэлгэц", "Full screen");
  return (
    <button type="button" onClick={() => void fs.toggle()} aria-label={label} title={label} aria-pressed={fs.full}
      className="flex min-h-9 min-w-9 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-50">
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={fs.full ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"} />
      </svg>
    </button>
  );
}
