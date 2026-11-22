import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getTrade } from "@/lib/trades";
import { TradeForm } from "@/components/TradeForm";
import { toZoneInput } from "@/lib/format";
import { getT, getViewer } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Арилжаа засах — XAU Analytics", "Edit trade — XAU Analytics") };
}

export default async function EditTradePage({ params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const { id } = await params;
  const tr = await getTrade(user.id, id);
  if (!tr) notFound();
  const s = (v: number | null) => (v === null ? "" : String(v));
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("Арилжаа засах", "Edit trade")}</h1>
      {tr.imageMime && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/trades/${tr.id}/image`} alt={t("Арилжааны зураг", "Trade screenshot")} className="max-h-80 rounded-lg border border-zinc-800" />
      )}
      <TradeForm initial={{ id: tr.id, direction: tr.direction, lots: String(tr.lots), entryPrice: String(tr.entryPrice), exitPrice: s(tr.exitPrice), stopLoss: s(tr.stopLoss),
        takeProfit: s(tr.takeProfit), openedAt: toZoneInput(tr.openedAt, v.timeZone), closedAt: toZoneInput(tr.closedAt, v.timeZone), note: tr.note ?? "", hasImage: !!tr.imageMime }} />
    </div>
  );
}
