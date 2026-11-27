"use client";
import { useEffect } from "react";

/** What the browser offers when the site can be installed (Chrome, Edge, Android); kept until the user asks. */
export type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
declare global {
  interface Window { __xauInstall?: InstallPrompt | null }
}
export const INSTALL_EVENT = "xau:installable";

/** Registers the service worker (push and the installed app need it) and keeps the browser's install offer for later. */
export function ServiceWorkerSetup() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__xauInstall = e as InstallPrompt;
      window.dispatchEvent(new Event(INSTALL_EVENT));
    };
    const onInstalled = () => { window.__xauInstall = null; window.dispatchEvent(new Event(INSTALL_EVENT)); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  return null;
}
