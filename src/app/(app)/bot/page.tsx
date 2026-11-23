import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { getLiveView } from "@/lib/bot/liveDb";
import { BotPanel } from "@/components/BotPanel";
import { BotGuide, BacktestGuide } from "@/components/BotGuide";
import { getT, getViewer } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Бот — XAU Analytics", "Bot — XAU Analytics") };
}

export default async function BotPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const { account } = await searchParams;
  const view = await getLiveView(user.id, new Date(), typeof account === "string" ? account : undefined);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Бот", "Bot")}</h1>
        <p className="page-lede">{t("Өөрийн MT5 дээрх роботыг эндээс асааж, зогсоож, тохируулж, хянана. Энэ хуудас зөвхөн таных: таны токен, тохиргоо, арилжааны түүх бусад хэрэглэгчид харагдахгүй.", "Start, stop, configure and watch the robot on your own MT5 from here. This page is yours alone: other users cannot see your token, settings or trade history.")}</p>
      </div>
      <p role="note" className="flex max-w-3xl gap-3 rounded-xl bg-amber-400/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200 sm:px-5">
        <span aria-hidden className="mt-1 h-[13px] w-[13px] shrink-0 rounded-full border-[3px] border-amber-400" />
        <span>{t("Scalper арга шалгагдаагүй: өнгөрсөн дата дээр ашигтай гэдэг нь нотлогдоогүй. Ашиг баталгаагүй, алдагдал хүлээх эрсдэлтэй. Санхүүгийн зөвлөгөө биш. Арилжаа таны өөрийн дансанд, таны шийдвэрээр хийгдэнэ.", "The Scalper method is unproven: it has not been shown to be profitable on past data. Profit is not guaranteed and you can lose money. Not financial advice. Trades are placed in your own account, by your own decision.")}</span>
      </p>
      {/* Status and controls first; the setup manual follows and opens on its own only until the robot is connected. */}
      <BotPanel key={view.account} initial={JSON.parse(JSON.stringify(view))} syncUrl={`${origin}/api/bot/sync`} />
      <BotGuide origin={origin} hasToken={view.hasToken} online={view.online} v={v} />
      <BacktestGuide v={v} />
    </div>
  );
}
