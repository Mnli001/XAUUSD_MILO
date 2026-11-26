import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getT, getViewer } from "@/lib/prefs.server";
import { bankLinks, paymentFor, refreshPayment } from "@/lib/payments";
import { qpayConfig } from "@/lib/qpay";
import { PLANS, isPlanId, tugrik } from "@/lib/plans";
import { choosePlanAction } from "@/lib/actions/payments";
import { PayStatus } from "@/components/PayStatus";
import { Countdown } from "@/components/Countdown";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Төлбөр — XAU Analytics", "Payment — XAU Analytics") };
}

/** One QPay invoice: bank-app buttons first (a phone cannot scan its own screen), the QR beside them on a computer. */
export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const { id } = await params;
  let p = await paymentFor(id, user.id);
  if (!p) notFound();
  const cfg = qpayConfig(process.env);
  if (cfg && p.status === "PENDING") {
    try { p = (await refreshPayment(id, new Date(), cfg)) ?? p; } catch (e) { console.error("[qpay] page check failed", e); }
  }
  const name = isPlanId(p.plan) ? PLANS[p.plan].name : p.plan;
  const expired = p.status === "EXPIRED" || (p.status === "PENDING" && p.expiresAt <= new Date());
  const banks = bankLinks(p);
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
          <Link href="/today" className="btn mt-5">{t("Өнөөдөр хуудас руу", "Go to Today")}</Link>
        </section>
      ) : expired ? (
        <section className="card text-center">
          <p className="text-lg font-semibold text-zinc-100">{t("Энэ нэхэмжлэхийн хугацаа дууссан", "This invoice has expired")}</p>
          <p className="mt-2 text-sm text-zinc-400">{t("Төлсөн бол хэдэн минутын дотор автоматаар нээгдэнэ. Төлөөгүй бол шинээр үүсгээрэй.", "If you did pay, access opens by itself within minutes. If not, start a new one.")}</p>
          <form action={choosePlanAction} className="mt-5"><input type="hidden" name="plan" value={p.plan} /><button className="btn">{t("Шинээр төлөх", "Pay again")}</button></form>
        </section>
      ) : (
        <>
          <section className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <PayStatus id={p.id} />
              <span className="text-sm text-zinc-500">{t("Үлдсэн хугацаа", "Time left")} <Countdown to={p.expiresAt.toISOString()} /></span>
            </div>
          </section>
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="card" aria-labelledby="banks-h">
              <h2 id="banks-h" className="card-title">{t("Банкны аппаар төлөх", "Pay in your bank app")}</h2>
              <p className="mt-1 text-sm text-zinc-400">{t("Утаснаасаа банкаа сонгоход апп нээгдэж, дүн бөглөгдсөн байна.", "Pick your bank on your phone: its app opens with the amount filled in.")}</p>
              {banks.length > 0 ? (
                <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {banks.map((b) => (
                    <li key={b.link}>
                      <a href={b.link} className="glass-tile flex min-h-14 items-center gap-2.5 text-sm text-zinc-100">
                        {/* eslint-disable-next-line @next/next/no-img-element -- bank logos come from QPay's own address */}
                        {b.logo && <img src={b.logo} alt="" width={32} height={32} loading="lazy" className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain" />}
                        <span className="min-w-0 leading-tight">{v.locale === "en" ? b.name : b.description || b.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-3 text-sm text-zinc-500">{t("Банкны жагсаалт ирсэнгүй. QR-ыг уншуулна уу.", "No bank list came back. Please scan the QR.")}</p>}
              {p.shortUrl && <p className="mt-4 text-sm"><a href={p.shortUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-amber-300 underline decoration-amber-400/50 underline-offset-4">{t("QPay хуудсаар төлөх", "Pay on QPay's page")}</a></p>}
            </section>
            {p.qrImage && (
              <section className="card text-center" aria-labelledby="qr-h">
                <h2 id="qr-h" className="card-title">{t("Эсвэл QR уншуулах", "Or scan the QR")}</h2>
                {/* eslint-disable-next-line @next/next/no-img-element -- a one-off QR returned by QPay as base64 */}
                <img src={`data:image/png;base64,${p.qrImage}`} alt={t(`${tugrik(p.amount)}-ийн QPay QR код`, `QPay QR code for ${tugrik(p.amount)}`)} width={240} height={240} className="mx-auto mt-3 w-full max-w-60 rounded-2xl bg-white p-3" />
                <p className="mt-3 text-xs text-zinc-500">{t("Өөр утас эсвэл компьютерийн дэлгэцнээс банкны аппаараа уншуулна.", "Scan it with your bank app from another phone or a computer screen.")}</p>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
