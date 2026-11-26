"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useT } from "./PrefsProvider";

const EVERY_MS = 5000;

/**
 * On the payment page: asks the server every 5 seconds whether Wire has the money (the server asks Wire).
 * The moment it is paid or expired the page reloads to show it; after that it stops asking.
 */
export function PayStatus({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    const tick = async () => {
      if (done.current || document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/payments/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const { status } = (await res.json()) as { status: string };
        if (status !== "PENDING" && !done.current) { done.current = true; router.refresh(); }
      } catch { /* offline: the next round tries again */ }
    };
    const timer = window.setInterval(tick, EVERY_MS);
    return () => clearInterval(timer);
  }, [id, router]);
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-zinc-400">
      <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
      {t("Төлбөрийг шалгаж байна… Төлсний дараа энэ хуудас өөрөө шинэчлэгдэнэ.", "Checking for your payment… This page updates by itself once you pay.")}
    </p>
  );
}
