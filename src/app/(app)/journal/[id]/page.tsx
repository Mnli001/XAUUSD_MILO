import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getTrade } from "@/lib/trades";
import { TradeForm } from "@/components/TradeForm";
import { toUbInput } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Арилжаа засах — XAU Analytics" };

export default async function EditTradePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const t = await getTrade(user.id, id);
  if (!t) notFound();
  const s = (v: number | null) => (v === null ? "" : String(v));
  return (
    <div className="space-y-4">
      <h1 className="page-title">Арилжаа засах</h1>
      {t.imageMime && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/trades/${t.id}/image`} alt="Арилжааны зураг" className="max-h-80 rounded-lg border border-zinc-800" />
      )}
      <TradeForm initial={{ id: t.id, direction: t.direction, lots: String(t.lots), entryPrice: String(t.entryPrice), exitPrice: s(t.exitPrice), stopLoss: s(t.stopLoss),
        takeProfit: s(t.takeProfit), openedAt: toUbInput(t.openedAt), closedAt: toUbInput(t.closedAt), note: t.note ?? "", hasImage: !!t.imageMime }} />
    </div>
  );
}
