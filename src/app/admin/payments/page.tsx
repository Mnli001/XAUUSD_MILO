import { getViewer } from "@/lib/prefs.server";
import { listPayments } from "@/lib/payments";
import { PLANS, isPlanId, tugrik } from "@/lib/plans";
import { qpayConfig } from "@/lib/qpay";

export const dynamic = "force-dynamic";

/** Every QPay payment, newest first. Access opens by itself; this page is for checking and answering questions. */
export default async function AdminPaymentsPage() {
  const v = await getViewer();
  const { t } = v;
  const rows = await listPayments(300);
  const cfg = qpayConfig(process.env);
  const paidTotal = rows.filter((r) => r.status === "PAID").reduce((s, r) => s + r.amount, 0);
  const tone = (s: string) => (s === "PAID" ? "text-emerald-400" : s === "PENDING" ? "text-amber-300" : "text-zinc-500");
  const word = (s: string) => (s === "PAID" ? t("Төлөгдсөн", "Paid") : s === "PENDING" ? t("Хүлээгдэж буй", "Pending") : t("Хугацаа дууссан", "Expired"));
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Төлбөр", "Payments")}</h1>
        <p className="page-lede">
          {cfg ? t(`QPay: ${cfg.baseUrl.includes("sandbox") ? "туршилтын (sandbox)" : "жинхэнэ"} горим.`, `QPay: ${cfg.baseUrl.includes("sandbox") ? "sandbox" : "live"} mode.`) : t("QPay тохируулаагүй: Railway-д QPAY_USERNAME, QPAY_PASSWORD, QPAY_INVOICE_CODE оруулна уу.", "QPay is not set up: add QPAY_USERNAME, QPAY_PASSWORD, QPAY_INVOICE_CODE on Railway.")}
          {" "}{t(`Нийт төлөгдсөн: ${tugrik(paidTotal)}.`, `Paid in total: ${tugrik(paidTotal)}.`)}
        </p>
      </div>
      <div className="table-card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead><tr className="border-b border-zinc-800">
            {[t("Огноо", "Date"), t("Хэрэглэгч", "User"), t("Багц", "Plan"), t("Дүн", "Amount"), t("Төлөв", "Status"), t("Эрх дуусах", "Access until"), t("Гүйлгээ", "Ref")].map((h) => <th key={h} className="th whitespace-nowrap">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="td text-zinc-500">{t("Төлбөр алга", "No payments yet")}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-800/70">
                <td className="td whitespace-nowrap tabular-nums text-zinc-400">{v.dateTime(r.createdAt)}</td>
                <td className="td">{r.email}</td>
                <td className="td">{isPlanId(r.plan) ? PLANS[r.plan].name : r.plan}</td>
                <td className="td tabular-nums">{tugrik(r.amount)}</td>
                <td className={`td whitespace-nowrap ${tone(r.status)}`}>{word(r.status)}</td>
                <td className="td whitespace-nowrap tabular-nums text-zinc-400">{r.accessUntil ? v.date(r.accessUntil) : "—"}</td>
                <td className="td font-mono text-xs text-zinc-500">{r.senderInvoiceNo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
