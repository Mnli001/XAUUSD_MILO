import { getTodaySnapshot } from "@/lib/snapshot";
import { SYMBOL } from "@/lib/ingest/prices";
import { CandleChart } from "@/components/CandleChart";

export const dynamic = "force-dynamic";
export const metadata = { title: "Чарт — XAU Analytics" };

export default async function ChartPage() {
  const snap = await getTodaySnapshot(SYMBOL, new Date());
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">XAUUSD чарт</h1>
      <CandleChart levels={snap.levels} />
    </div>
  );
}
