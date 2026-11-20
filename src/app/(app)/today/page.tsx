import { getTodaySnapshot } from "@/lib/snapshot";
import { SYMBOL } from "@/lib/ingest/prices";
import { ubHour } from "@/lib/time";
import { HourlyTable } from "@/components/HourlyTable";
import { PriceHeader, BiasBar, LevelsCard, Empty } from "@/components/TodayCards";
import { getEvents, getNextHighEvent, getReactions } from "@/lib/events";
import { Countdown } from "@/components/Countdown";
import { ReactionRows } from "@/components/NewsList";
import { formatUbDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Өнөөдөр — XAU Analytics" };

export default async function TodayPage() {
  const now = new Date();
  const [snap, upcoming, next, reactions] = await Promise.all([
    getTodaySnapshot(SYMBOL, now),
    getEvents(now, new Date(now.getTime() + 24 * 36e5)),
    getNextHighEvent(now),
    getReactions(),
  ]);
  const highSoon = upcoming.filter((e) => e.impact === "HIGH").map((e) => ({ time: e.time, title: e.title }));
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
              <HourlyTable rows={snap.hourly} nowHour={ubHour(now)} events={highSoon} />
            </div>
          ) : <Empty title="Цагийн магадлал" />}
        </div>
        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-2 text-sm font-medium text-zinc-400">Дараагийн чухал мэдээ</h2>
            {next ? (
              <>
                <div className="font-medium">{next.title}</div>
                <div className="text-sm text-zinc-400">{formatUbDateTime(next.time)} (УБ)</div>
                <div className="my-2 text-2xl"><Countdown to={next.time.toISOString()} /></div>
                <p className="mb-1 text-xs text-zinc-500">Өмнө нь ийм мэдээний дараа:</p>
                <ReactionRows stats={reactions.get(next.type)} />
              </>
            ) : <p className="text-zinc-500">Бүртгэгдсэн чухал мэдээ алга</p>}
          </div>
          <LevelsCard levels={snap.levels} />
        </div>
      </div>
    </div>
  );
}
