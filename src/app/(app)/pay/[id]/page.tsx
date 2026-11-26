import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getT, getViewer } from "@/lib/prefs.server";
import { paymentFor, refreshPayment } from "@/lib/payments";
import { wireConfig } from "@/lib/wire";
import { PLANS, isPlanId, tugrik } from "@/lib/plans";
import { choosePlanAction } from "@/lib/actions/payments";
import { PayStatus } from "@/components/PayStatus";
import { InvoiceCountdown } from "@/components/Countdown";
import { telegramConfigured } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Төлбөр", "Payment") };
}

/**
 * One payment. Buyers come back here from Wire's hosted checkout (success_url); while it is still open this page
 * links back to the checkout (QR, bank apps, cards) and watches for the payment.
 */
export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const { id } = await params;
  let p = await paymentFor(id, user.id);
  if (!p) notFound();
  const cfg = wireConfig(process.env);
  if (cfg && p.status === "PENDING") {
    try { p = (await refreshPayment(id, new Date(), cfg)) ?? p; } catch (e) { console.error("[wire] page check failed", e); }
  }
  const name = isPlanId(p.plan) ? PLANS[p.plan].name : p.plan;
  const expired = p.status === "EXPIRED" || (p.status === "PENDING" && p.expiresAt <= new Date());
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="page-title">{t(`${name} багц`, `${name} plan`)}</h1>
        <p className="page-lede tabular-nums">{tugrik(p.amount)} · {t(`${p.days} хоног`, `${p.days} days`)} · {t("Гүйлгээ", "Ref")} {p.senderInvoiceNo}</p>
      </div>

      {p.status === "PAID" ? (
        <section className="card border-emerald-400/40 text-center" aria-live="polite">
          <p className="font-display text-3xl text-emerald-300">{t("Төлбөр баталгаажлаа", "Payment confirmed")}</p>
          <p className="mt-2 text-zinc-300">{p.accessUntil ? t(`Таны эрх ${v.date(p.accessUntil)} хүртэл нээгдлээ. Бүх тоо одоо харагдана.`, `Your access is open until ${v.date(p.accessUntil)}. Every number now shows.`) : null}</p>
          {telegramConfigured() && !user.telegramChatId ? (
            <div className="mx-auto mt-5 max-w-md rounded-2xl border p-4 text-left" style={{ borderColor: "var(--hairline)" }}>
              <p className="text-sm font-semibold text-zinc-100">{t("Дараагийн алхам: Telegram холбох", "Next step: link Telegram")}</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">{t("Setup идэвхжих мөчид орох, stop, target-тай дохио утсанд чинь шууд ирнэ. Холбосон Telegram-аар нууц үгээ мартсан үед сэргээж ч болно.", "The moment a setup turns active, its entry, stop and target reach your phone. A linked Telegram also lets you reset a forgotten password.")}</p>
              <Link href="/settings#telegram" className="btn mt-3">{t("Telegram холбох", "Link Telegram")}</Link>
            </div>
          ) : null}
          <Link href="/today" className={telegramConfigured() && !user.telegramChatId ? "btn-ghost mt-4" : "btn mt-5"}>{t("Өнөөдөр хуудас руу", "Go to Today")}</Link>
        </section>
      ) : expired ? (
        <section className="card text-center">
          <p className="text-lg font-semibold text-zinc-100">{t("Энэ нэхэмжлэхийн хугацаа дууссан", "This invoice has expired")}</p>
          <p className="mt-2 text-sm text-zinc-400">{t("Төлсөн бол хэдэн минутын дотор автоматаар нээгдэнэ. Төлөөгүй бол шинээр үүсгээрэй.", "If you did pay, access opens by itself within minutes. If not, start a new one.")}</p>
          <form action={choosePlanAction} className="mt-5"><input type="hidden" name="plan" value={p.plan} /><button className="btn">{t("Шинээр төлөх", "Pay again")}</button></form>
        </section>
      ) : (
        <section className="card space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PayStatus id={p.id} />
            <span className="text-sm text-zinc-500">{t("Үлдсэн хугацаа", "Time left")} <InvoiceCountdown to={p.expiresAt.toISOString()} /></span>
          </div>
          {p.checkoutUrl && (
            <div>
              <a href={p.checkoutUrl} className="btn w-full sm:w-auto">{t(`${tugrik(p.amount)} төлөх`, `Pay ${tugrik(p.amount)}`)}</a>
              <p className="mt-3 text-sm text-zinc-400">{t("Wire-ийн төлбөрийн хуудас нээгдэнэ: QPay, банкны апп, карт, Toki зэргээс сонгоод төлнө. Төлсний дараа энд буцаж ирэхэд эрх тань нээгдсэн байна.", "Wire's payment page opens: pick QPay, a bank app, a card, Toki and more. Come back here after paying and your access will be open.")}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
