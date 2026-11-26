"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "./PrefsProvider";

const two = (n: number) => String(n).padStart(2, "0");

/**
 * Time left until `to`. At zero it shows `expiredText` (by default "out now", which suits a news release)
 * and calls `onEnd` once.
 */
export function Countdown({ to, expiredText, onEnd }: { to: string; expiredText?: string; onEnd?: () => void }) {
  const t = useT();
  const [left, setLeft] = useState<number | null>(null);
  const ended = useRef(false);
  const endRef = useRef(onEnd);
  useEffect(() => { endRef.current = onEnd; }, [onEnd]);
  useEffect(() => {
    ended.current = false;
    const tick = () => {
      const ms = new Date(to).getTime() - Date.now();
      setLeft(ms);
      if (ms <= 0 && !ended.current) { ended.current = true; endRef.current?.(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [to]);
  if (left === null) return <span className="font-mono">--:--:--</span>;
  if (left <= 0) return <span className="font-mono text-amber-400">{expiredText ?? t("гарлаа", "out now")}</span>;
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  return <span className="font-mono">{d > 0 ? t(`${d} өдөр `, `${d}d `) : ""}{two(Math.floor((s % 86400) / 3600))}:{two(Math.floor((s % 3600) / 60))}:{two(s % 60)}</span>;
}

/** The payment page's countdown: says the invoice has expired and reloads the page so it shows the expired state. */
export function InvoiceCountdown({ to }: { to: string }) {
  const t = useT();
  const router = useRouter();
  return <Countdown to={to} expiredText={t("хугацаа дууссан", "expired")} onEnd={() => router.refresh()} />;
}
