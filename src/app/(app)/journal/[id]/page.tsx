import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getTrade } from "@/lib/trades";
import { TradeForm } from "@/components/TradeForm";
import { toZoneInput } from "@/lib/format";
import { getT, getViewer } from "@/lib/prefs.server";
import { BackLink, SidePill } from "@/components/Timetable";

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
    <div className="space-y-4 sm:space-y-5">
      <div>
        <BackLink href="/journal">{t("Журнал", "Journal")}</BackLink>
        <h1 className="page-title">{t("Арилжаа засах", "Edit trade")}</h1>
        <p className="page-lede flex flex-wrap items-center gap-2"><SidePill side={tr.direction} /><span className="tabular-nums">{v.dateTime(tr.openedAt)} {v.zone}</span></p>
      </div>
      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,42rem)_minmax(0,1fr)]">
        <TradeForm initial={{ id: tr.id, direction: tr.direction, lots: String(tr.lots), entryPrice: String(tr.entryPrice), exitPrice: s(tr.exitPrice), stopLoss: s(tr.stopLoss),
          takeProfit: s(tr.takeProfit), openedAt: toZoneInput(tr.openedAt, v.timeZone), closedAt: toZoneInput(tr.closedAt, v.timeZone), note: tr.note ?? "", hasImage: !!tr.imageMime }} />
        {tr.imageMime && (
          <figure className="card m-0 p-2 sm:p-2 lg:sticky lg:top-8 max-lg:order-first">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/trades/${tr.id}/image`} alt={t("Арилжааны зураг", "Trade screenshot")} className="max-h-80 w-full rounded-lg object-contain lg:max-h-[32rem]" />
          </figure>
        )}
      </div>
    </div>
  );
}
