import { getTodaySnapshot } from "@/lib/snapshot";
import { SYMBOL } from "@/lib/ingest/prices";
import { ubHour } from "@/lib/time";
import { HourlyTable } from "@/components/HourlyTable";
import { PriceHeader, BiasBar, LevelsCard, Empty } from "@/components/TodayCards";

export const dynamic = "force-dynamic";
export const metadata = { title: "Өнөөдөр — XAU Analytics" };

export default async function TodayPage() {
  const now = new Date();
  const snap = await getTodaySnapshot(SYMBOL, now);
  return (
    <div className="space-y-4">
      <PriceHeader price={snap.price} bias={snap.bias} />
      <BiasBar bias={snap.bias} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {snap.hourly ? (
            <div className="card overflow-x-auto">
              <h2 className="mb-1 text-sm font-medium text-zinc-400">Цагийн магадлал — дараагийн 24 цаг</h2>
              <p className="mb-3 text-xs text-zinc-500">Сүүлийн 6 сарын 1 цагийн лаанаас. Одоогийн трендтэй ижил нөхцөлтэй өдрүүдээр тооцно; түүвэр 30-аас цөөн бол хувь гаргахгүй.</p>
              <HourlyTable rows={snap.hourly} nowHour={ubHour(now)} events={[]} />
            </div>
          ) : <Empty title="Цагийн магадлал" />}
        </div>
        <div className="space-y-4"><LevelsCard levels={snap.levels} /></div>
      </div>
    </div>
  );
}
