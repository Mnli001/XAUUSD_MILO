import { TradeForm } from "@/components/TradeForm";
import { toZoneInput } from "@/lib/format";
import { getT, getViewer } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Арилжаа нэмэх — XAU Analytics", "Add trade — XAU Analytics") };
}

export default async function NewTradePage() {
  const v = await getViewer();
  const { t } = v;
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("Арилжаа нэмэх", "Add trade")}</h1>
      <TradeForm initial={{ direction: "BUY", lots: "", entryPrice: "", exitPrice: "", stopLoss: "", takeProfit: "", openedAt: toZoneInput(new Date(), v.timeZone), closedAt: "", note: "", hasImage: false }} />
    </div>
  );
}
