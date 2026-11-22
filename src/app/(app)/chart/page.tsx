import { getTodaySnapshot } from "@/lib/snapshot";
import { SYMBOL } from "@/lib/ingest/prices";
import { CandleChart } from "@/components/CandleChart";
import { getT } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Чарт — XAU Analytics", "Chart — XAU Analytics") };
}

export default async function ChartPage() {
  const t = await getT();
  const snap = await getTodaySnapshot(SYMBOL, new Date());
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("Алтны чарт", "Gold chart")}</h1>
      <CandleChart levels={snap.levels} />
    </div>
  );
}
