"use client";
import { useEffect, useState } from "react";
import { useT } from "./PrefsProvider";

const two = (n: number) => String(n).padStart(2, "0");

export function Countdown({ to }: { to: string }) {
  const t = useT();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(new Date(to).getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [to]);
  if (left === null) return <span className="font-mono">--:--:--</span>;
  if (left <= 0) return <span className="font-mono text-amber-400">{t("гарлаа", "out now")}</span>;
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  return <span className="font-mono">{d > 0 ? t(`${d} өдөр `, `${d}d `) : ""}{two(Math.floor((s % 86400) / 3600))}:{two(Math.floor((s % 3600) / 60))}:{two(s % 60)}</span>;
}
