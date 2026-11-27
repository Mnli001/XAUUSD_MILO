"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useT } from "./PrefsProvider";
import { createPriceAlertAction, deletePriceAlertAction, type AlertState } from "@/lib/actions/alerts";

export type AlertRow = { id: string; level: number; direction: "above" | "below"; set: string; fired: string | null; firedPrice: number | null };

const px = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * "Tell me when gold reaches …": a level to set, the alerts still waiting (nearest first) and the last few that fired.
 * `channels` says where a fired alert goes, so the reader knows whether to turn something on.
 */
export function PriceAlertsCard({ alerts, price, channels, max }: { alerts: AlertRow[]; price: number | null; channels: { telegram: boolean; push: boolean }; max: number }) {
  const t = useT();
  const [state, action, pending] = useActionState<AlertState, FormData>(createPriceAlertAction, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) form.current?.reset(); }, [state]);
  const waiting = alerts.filter((a) => !a.fired).sort((a, b) => (price === null ? 0 : Math.abs(a.level - price) - Math.abs(b.level - price)));
  const fired = alerts.filter((a) => a.fired);
  const where = channels.telegram && channels.push ? t("Telegram болон утсанд ирнэ.", "Arrives on Telegram and on your phone.")
    : channels.telegram ? t("Telegram-аар ирнэ.", "Arrives on Telegram.")
    : channels.push ? t("Утсанд мэдэгдлээр ирнэ.", "Arrives as a phone notification.")
    : null;

  return (
    <section id="alerts" className="card scroll-mt-24" aria-labelledby="alerts-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="alerts-h" className="card-title">{t("Үнийн сэрэмжлүүлэг", "Price alerts")}</h2>
        {price !== null && <span className="text-xs text-zinc-500 tabular-nums">{t("Одоо", "Now")} {px(price)}</span>}
      </div>
      <div className="mt-3 grid gap-5 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div>
          <form ref={form} action={action} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="label" htmlFor="alert-level">{t("Алт энэ үнэд хүрэхэд мэдэгдэх", "Tell me when gold reaches")}</label>
              <input id="alert-level" name="level" className="input tabular-nums" type="number" inputMode="decimal" step="0.01" min="0" required placeholder={price !== null ? price.toFixed(2) : "3620.00"} />
            </div>
            <button className="btn shrink-0" disabled={pending || waiting.length >= max}>{t("Тавих", "Set")}</button>
          </form>
          {state.ok && <p role="status" className="mt-2 text-sm text-emerald-400">{state.ok}</p>}
          {state.error && <p role="alert" className="mt-2 text-sm text-red-300">{state.error}</p>}
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            {where ?? t("Мэдэгдэл хаана ирэхийг сонгоогүй байна. ", "You have not chosen where alerts go. ")}
            {!where && <Link href="/settings#push" className="text-amber-300 underline-offset-2 hover:underline">{t("Тохиргоонд утасны мэдэгдэл эсвэл Telegram асаана уу.", "Turn on phone notifications or Telegram in Settings.")}</Link>}
            {where && !channels.push && <> <Link href="/settings#push" className="text-amber-300 underline-offset-2 hover:underline">{t("Утсандаа мэдэгдэл авах", "Get it on your phone")}</Link></>}
          </p>
        </div>

        <div className="min-w-0">
          {waiting.length === 0 && fired.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("Одоогоор сэрэмжлүүлэг алга. Үнэ оруулаад “Тавих” дарна уу.", "No alerts yet. Enter a price and press “Set”.")}</p>
          ) : (
            <ul className="divide-y divide-zinc-800/80" aria-label={t("Хүлээгдэж буй сэрэмжлүүлэг", "Waiting alerts")}>
              {waiting.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-zinc-100 tabular-nums">
                    <span aria-hidden className={a.direction === "above" ? "text-emerald-400" : "text-red-300"}>{a.direction === "above" ? "↑" : "↓"}</span>
                    <b className="font-semibold">{px(a.level)}</b>
                    <span className="text-xs text-zinc-500">{a.direction === "above" ? t("дээш хүрвэл", "on the way up") : t("доош хүрвэл", "on the way down")}{price !== null && ` · ${px(Math.abs(a.level - price))} ${t("зайтай", "away")}`}</span>
                  </span>
                  <form action={deletePriceAlertAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-red-300" aria-label={t(`${px(a.level)} сэрэмжлүүлгийг устгах`, `Delete the ${px(a.level)} alert`)}>{t("Устгах", "Delete")}</button>
                  </form>
                </li>
              ))}
              {fired.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm text-zinc-500 tabular-nums">
                  <span><span aria-hidden>✓ </span>{px(a.level)} · {t("хүрсэн", "reached")} {a.fired}{a.firedPrice !== null && ` (${px(a.firedPrice)})`}</span>
                  <form action={deletePriceAlertAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" aria-label={t(`${px(a.level)} түүхийг арилгах`, `Clear the ${px(a.level)} entry`)}>{t("Арилгах", "Clear")}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function PriceAlertsLocked() {
  const t = useT();
  return (
    <section className="card" aria-labelledby="alerts-h">
      <h2 id="alerts-h" className="card-title">{t("Үнийн сэрэмжлүүлэг", "Price alerts")}</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-400">{t("“Алт 3,620 хүрвэл мэдэгдээрэй” гэж түвшин тавихад Telegram эсвэл утсанд мэдэгдэл ирнэ. Багцтай хэрэглэгчдэд.", "Set a level like “tell me when gold reaches 3,620” and get a Telegram or phone notification. Comes with a plan.")}</p>
      <Link href="/plans" className="btn-ghost mt-4">{t("Багц сонгох", "Choose a plan")}</Link>
    </section>
  );
}
