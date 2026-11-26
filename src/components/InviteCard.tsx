"use client";
import { useState } from "react";
import { useT } from "./PrefsProvider";

/** The user's invite link with a copy button, and what it has earned so far. */
export function InviteCard({ link, days, stats }: { link: string; days: number; stats: { invited: number; paid: number; daysEarned: number } }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the field is selectable by hand */ }
  };
  return (
    <section className="card" aria-labelledby="invite-h">
      <h2 id="invite-h" className="card-title">{t("Найзаа урих", "Invite a friend")}</h2>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-zinc-300">
        {t(`Энэ холбоосоор бүртгүүлсэн найз тань аль нэг багц авмагц танд +${days} хоног автоматаар нэмэгдэнэ. Найз бүрээс нэг удаа.`, `When a friend who registers through this link buys any plan, you get +${days} days, added by itself. Once per friend.`)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input readOnly value={link} aria-label={t("Урилгын холбоос", "Invite link")} onFocus={(e) => e.currentTarget.select()} className="input min-w-0 flex-1 font-mono text-sm" />
        <button type="button" onClick={copy} className="btn">{copied ? t("Хуулагдлаа", "Copied") : t("Хуулах", "Copy")}</button>
      </div>
      <p role="status" className="mt-3 text-sm text-zinc-400 tabular-nums">
        {t(`Урьсан: ${stats.invited} · Багц авсан: ${stats.paid} · Олсон: +${stats.daysEarned} хоног`, `Invited: ${stats.invited} · Bought a plan: ${stats.paid} · Earned: +${stats.daysEarned} days`)}
      </p>
    </section>
  );
}
