"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useT } from "./PrefsProvider";
import { subscribePushAction, testPushAction, unsubscribePushAction } from "@/lib/actions/push";
import { INSTALL_EVENT } from "./ServiceWorkerSetup";

type Status = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const noSubscribe = () => () => {};
function useInstall() {
  const subscribe = useCallback((cb: () => void) => { window.addEventListener(INSTALL_EVENT, cb); return () => window.removeEventListener(INSTALL_EVENT, cb); }, []);
  const prompt = useSyncExternalStore(subscribe, () => window.__xauInstall ?? null, () => null);
  const watchMode = useCallback((cb: () => void) => { const m = window.matchMedia("(display-mode: standalone)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); }, []);
  const installed = useSyncExternalStore(watchMode, isStandalone, () => false);
  const ios = useSyncExternalStore(noSubscribe, isIos, () => false);
  return { prompt, installed, ios };
}

/**
 * Turns push notifications on or off for this device and helps install the site as an app. On iPhone, push only
 * works once the site is added to the home screen, so that comes first there.
 */
export function PushCard({ publicKey, paid }: { publicKey: string; paid: boolean }) {
  const t = useT();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok?: string; error?: string }>({});
  const { prompt, installed, ios } = useInstall();

  useEffect(() => {
    (async () => {
      await Promise.resolve(); // read the browser after the first paint, not during the effect itself
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setStatus(isIos() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setStatus("denied");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
      // keep the server's copy current (it may have been removed after the push service dropped it)
      if (sub) await subscribePushAction(sub.toJSON());
    })().catch(() => setStatus("unsupported"));
  }, []);

  const turnOn = async () => {
    setBusy(true); setNote({});
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setStatus(permission === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const r = await subscribePushAction(sub.toJSON());
      setNote(r);
      if (!r.error) { setStatus("on"); router.refresh(); }
    } catch {
      setNote({ error: t("Мэдэгдэл асааж чадсангүй. Хуудсыг шинэчлээд дахин оролдоно уу.", "Could not turn notifications on. Reload the page and try again.") });
    } finally { setBusy(false); }
  };
  const turnOff = async () => {
    setBusy(true); setNote({});
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) { await unsubscribePushAction(sub.endpoint); await sub.unsubscribe(); }
      setStatus("off");
      router.refresh();
      setNote({ ok: t("Энэ төхөөрөмж дээр мэдэгдэл унтарлаа.", "Notifications are off on this device.") });
    } finally { setBusy(false); }
  };
  const test = async () => { setBusy(true); setNote({}); try { setNote(await testPushAction()); } finally { setBusy(false); } };
  const install = async () => { if (!prompt) return; await prompt.prompt(); await prompt.userChoice.catch(() => null); window.__xauInstall = null; window.dispatchEvent(new Event(INSTALL_EVENT)); };

  const on = status === "on";
  return (
    <section id="push" className="card scroll-mt-24" aria-labelledby="push-h">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="push-h" className="text-[15px] font-semibold text-zinc-100">{t("Утсандаа мэдэгдэл авах", "Notifications on your phone")}</h2>
        {status !== "checking" && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${on ? "bg-emerald-500/15 text-emerald-400" : "border border-zinc-800 text-zinc-400"}`}>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-400" : "bg-zinc-600"}`} />{on ? t("Энэ төхөөрөмж дээр асаалттай", "On for this device") : t("Унтраалттай", "Off")}
          </span>
        )}
      </div>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-400">{t("Telegram-гүйгээр setup дохио, чухал мэдээний сануулга, үнийн сэрэмжлүүлэг, долоо хоногийн тайлан энэ төхөөрөмжид шууд ирнэ. Утас, компьютер бүр дээр тусад нь асаана.", "Setup signals, heads-ups before key releases, price alerts and the weekly report arrive on this device, no Telegram needed. Turn it on for each phone or computer.")}</p>
      {!paid && <p className="mt-2 max-w-prose rounded-lg bg-amber-400/10 px-3 py-2 text-sm leading-relaxed text-amber-200">{t("Дохио, сэрэмжлүүлэг багцтай хэрэглэгчдэд ирнэ. Одоо асааж болно: багц авмагц ирж эхэлнэ.", "Signals and alerts come with a plan. You can turn this on now: they start as soon as you have one.")}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {status === "off" && <button type="button" className="btn" onClick={turnOn} disabled={busy}>{t("Мэдэгдэл асаах", "Turn on notifications")}</button>}
        {status === "on" && (
          <>
            <button type="button" className="btn-ghost" onClick={test} disabled={busy}>{t("Туршилтын мэдэгдэл илгээх", "Send a test notification")}</button>
            <button type="button" className="btn-ghost text-red-300" onClick={turnOff} disabled={busy}>{t("Унтраах", "Turn off")}</button>
          </>
        )}
      </div>
      {status === "denied" && <p className="mt-3 max-w-prose text-sm leading-relaxed text-amber-200">{t("Энэ site-ын мэдэгдлийг хөтөч дээр хориглосон байна. Хаягийн мөрний түгжээ дүрс → Мэдэгдэл → Зөвшөөрөх болгоод хуудсыг шинэчилнэ үү.", "Notifications for this site are blocked in the browser. Use the lock icon in the address bar → Notifications → Allow, then reload the page.")}</p>}
      {status === "unsupported" && <p className="mt-3 max-w-prose text-sm leading-relaxed text-zinc-400">{t("Энэ хөтөч push мэдэгдэл дэмжихгүй байна. Chrome, Edge, Firefox эсвэл Safari-ийн шинэ хувилбарыг ашиглана уу.", "This browser does not support push notifications. Use a recent Chrome, Edge, Firefox or Safari.")}</p>}
      {status === "ios-install" && <p className="mt-3 max-w-prose text-sm leading-relaxed text-amber-200">{t("iPhone дээр мэдэгдэл авахын тулд эхлээд доорх алхмаар app болгон суулгана.", "On iPhone, install it as an app first (steps below) to get notifications.")}</p>}
      {note.ok && <p role="status" className="mt-3 text-sm text-emerald-400">{note.ok}</p>}
      {note.error && <p role="alert" className="mt-3 text-sm text-red-300">{note.error}</p>}

      <div className="mt-5 border-t border-zinc-800 pt-4">
        <h3 className="text-sm font-semibold text-zinc-200">{t("App болгон суулгах", "Install as an app")}</h3>
        {installed ? (
          <p className="mt-1 text-sm text-zinc-400">{t("App болгон суулгасан байна.", "Installed as an app.")}</p>
        ) : prompt ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="max-w-prose text-sm text-zinc-400">{t("Нүүр дэлгэцэнд дүрс нь гарч, тусдаа цонхонд app шиг нээгдэнэ.", "It gets an icon on your home screen and opens in its own window like an app.")}</p>
            <button type="button" className="btn-ghost" onClick={install}>{t("Суулгах", "Install")}</button>
          </div>
        ) : ios ? (
          <ol className="mt-2 max-w-prose list-decimal space-y-1 ps-5 text-sm leading-relaxed text-zinc-400 marker:text-zinc-500">
            <li>{t("Энэ хуудсыг Safari-аар нээнэ.", "Open this page in Safari.")}</li>
            <li>{t("Доод талын Хуваалцах товч (дээш сумтай дөрвөлжин) дээр дарна.", "Tap the Share button (the square with an arrow).")}</li>
            <li>{t("“Нүүр дэлгэцэнд нэмэх” (Add to Home Screen)-ийг сонгоно.", "Choose “Add to Home Screen”.")}</li>
            <li>{t("Нүүр дэлгэцээс XAU-г нээгээд энд мэдэгдлээ асаана.", "Open XAU from the home screen and turn notifications on here.")}</li>
          </ol>
        ) : (
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-zinc-400">{t("Хөтчийн цэснээс “App суулгах” эсвэл “Нүүр дэлгэцэнд нэмэх”-ийг сонгоно.", "Choose “Install app” or “Add to Home screen” from the browser menu.")}</p>
        )}
      </div>
    </section>
  );
}
