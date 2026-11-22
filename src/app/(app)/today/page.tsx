import { getTodaySnapshot } from "@/lib/snapshot";
import { SYMBOL } from "@/lib/ingest/prices";
import { ubHour } from "@/lib/time";
import { HourlyTable } from "@/components/HourlyTable";
import { PriceHeader, BiasBar, LevelsCard, Empty } from "@/components/TodayCards";
import { getEvents, getNextHighEvent, getReactions } from "@/lib/events";
import { Countdown } from "@/components/Countdown";
import { ReactionRows } from "@/components/NewsList";
import { eventTitle } from "@/lib/data/calendarProvider";
import { getT, getViewer } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Өнөөдөр — XAU Analytics", "Today — XAU Analytics") };
}

export default async function TodayPage() {
  const v = await getViewer();
  const { t } = v;
  const now = new Date();
  const [snap, upcoming, next, reactions] = await Promise.all([
    getTodaySnapshot(SYMBOL, now),
    getEvents(now, new Date(now.getTime() + 24 * 36e5)),
    getNextHighEvent(now),
    getReactions(),
  ]);
  const highSoon = upcoming.filter((e) => e.impact === "HIGH").map((e) => ({ time: e.time, title: e.title, type: e.type }));
  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t("Өнөөдөр", "Today")}</h1>
      <PriceHeader price={snap.price} bias={snap.bias} v={v} />
      <BiasBar bias={snap.bias} v={v} />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          {snap.hourly ? (
            <div className="table-card">
              <div className="px-4 pt-4 sm:px-5 sm:pt-5">
                <h2 className="text-sm font-medium text-zinc-400">{t("Цагийн магадлал, дараагийн 24 цаг", "Hourly odds, next 24 hours")}</h2>
                <p className="mt-1 mb-2 max-w-prose text-xs leading-relaxed text-zinc-500">{t("Сүүлийн 6 сарын 1 цагийн лаанаас. Одоогийн трендтэй ижил нөхцөлтэй өдрүүдээр тооцно; түүвэр 30-аас цөөн бол хувь гаргахгүй.", "From the last 6 months of 1-hour candles. Counted over days with the same trend as now; no percentage is shown when the sample is under 30.")}</p>
              </div>
              <HourlyTable rows={snap.hourly} nowHour={ubHour(now)} events={highSoon} v={v} />
            </div>
          ) : <Empty title={t("Цагийн магадлал", "Hourly odds")} v={v} />}
        </div>
        <div className="space-y-4">
          <div className="card">
            <h2 className="card-title">{t("Дараагийн чухал мэдээ", "Next important release")}</h2>
            {next ? (
              <>
                <div className="font-medium">{eventTitle(next, t)}</div>
                <div className="text-sm text-zinc-400">{v.dateTime(next.time)} ({v.zone})</div>
                <div className="my-3 text-3xl font-semibold tracking-tight"><Countdown to={next.time.toISOString()} /></div>
                <p className="mb-1 text-xs text-zinc-500">{t("Өмнө нь ийм мэдээний дараа:", "After this kind of release before:")}</p>
                <ReactionRows stats={reactions.get(next.type)} v={v} />
              </>
            ) : <p className="text-zinc-500">{t("Бүртгэгдсэн чухал мэдээ алга", "No important releases on record")}</p>}
          </div>
          <LevelsCard levels={snap.levels} v={v} />
        </div>
      </div>
    </div>
  );
}
