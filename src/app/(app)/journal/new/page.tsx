import { TradeForm } from "@/components/TradeForm";
import { toZoneInput } from "@/lib/format";
import { getT, getViewer } from "@/lib/prefs.server";
import { BackLink } from "@/components/Timetable";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Арилжаа нэмэх — XAU Analytics", "Add trade — XAU Analytics") };
}

export default async function NewTradePage() {
  const v = await getViewer();
  const { t } = v;
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <BackLink href="/journal">{t("Журнал", "Journal")}</BackLink>
        <h1 className="page-title">{t("Арилжаа нэмэх", "Add trade")}</h1>
        <p className="page-lede">{t("Гарсан үнийг хоосон орхивол арилжаа нээлттэй гэж бүртгэгдэнэ. Stop loss оруулбал R тооцогдоно.", "Leave the exit price empty to record the trade as open. Enter a stop loss and its R is worked out.")}</p>
      </div>
      <TradeForm initial={{ direction: "BUY", lots: "", entryPrice: "", exitPrice: "", stopLoss: "", takeProfit: "", openedAt: toZoneInput(new Date(), v.timeZone), closedAt: "", note: "", hasImage: false }} />
    </div>
  );
}
