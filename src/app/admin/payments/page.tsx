import { requireAdmin } from "@/lib/auth";
import { getViewer } from "@/lib/prefs.server";
import { listPayments } from "@/lib/payments";
import { PLANS, isPlanId, tugrik } from "@/lib/plans";
import { wireConfig } from "@/lib/wire";

export const dynamic = "force-dynamic";

/** Every Wire payment, newest first. Access opens by itself; this page is for checking and answering questions. */
export default async function AdminPaymentsPage() {
  await requireAdmin(); // the layout's check does not guard this page: layouts do not re-run on navigation
  const v = await getViewer();
  const { t } = v;
  const rows = await listPayments(300);
  const cfg = wireConfig(process.env);
  const paidTotal = rows.filter((r) => r.status === "PAID").reduce((s, r) => s + r.amount, 0);
  const tone = (s: string) => (s === "PAID" ? "text-emerald-400" : s === "PENDING" ? "text-amber-300" : s === "REFUNDED" ? "text-red-400" : "text-zinc-500");
  const word = (s: string) => (s === "PAID" ? t("Төлөгдсөн", "Paid") : s === "PENDING" ? t("Хүлээгдэж буй", "Pending") : s === "REFUNDED" ? t("Буцаагдсан", "Refunded") : t("Хугацаа дууссан", "Expired"));
  const flagged = rows.filter((r) => r.adminNote && (r.status === "REFUNDED" || r.status === "PAID")).length;
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Төлбөр", "Payments")}</h1>
        <p className="page-lede">
          {cfg
            ? (cfg.webhookSecret
              ? t("Wire холбогдсон, webhook идэвхтэй.", "Wire is connected, with the webhook on.")
              : t("Wire холбогдсон. Webhook-ийн нууц (WIRE_WEBHOOK_SECRET) оруулаагүй тул төлбөр хуудас шалгах үед л баталгаажна.", "Wire is connected. No webhook secret (WIRE_WEBHOOK_SECRET) yet, so payments confirm only when the payment page checks."))
            : t("Wire тохируулаагүй: Railway-д WIRE_API_KEY оруулна уу.", "Wire is not set up: add WIRE_API_KEY on Railway.")}
          {" "}{t(`Нийт төлөгдсөн: ${tugrik(paidTotal)}.`, `Paid in total: ${tugrik(paidTotal)}.`)}
          {flagged > 0 && <> <span className="font-semibold text-red-400">{t(`Анхаарах төлбөр: ${flagged} (буцаалт гэх мэт, тэмдэглэлийг харна уу).`, `Payments needing a look: ${flagged} (refunds and the like, see the notes).`)}</span></>}
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
                <td className="td">{r.email ?? <span className="text-zinc-500">{t("(устгагдсан бүртгэл)", "(deleted account)")}</span>}</td>
                <td className="td">{isPlanId(r.plan) ? PLANS[r.plan].name : r.plan}</td>
                <td className="td tabular-nums">{tugrik(r.amount)}</td>
                <td className={`td whitespace-nowrap ${tone(r.status)}`}>{word(r.status)}</td>
                <td className="td whitespace-nowrap tabular-nums text-zinc-400">{r.accessUntil ? v.date(r.accessUntil) : "—"}</td>
                <td className="td font-mono text-xs text-zinc-500">{r.senderInvoiceNo}{r.adminNote && <span className="mt-1 block max-w-xs font-sans whitespace-normal text-amber-300">{r.adminNote}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
