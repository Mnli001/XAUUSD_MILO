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
    <div className="space-y-4">
      <div>
        <h1 className="page-title">{t("Бот", "Bot")}</h1>
        <p className="mt-1 max-w-prose text-sm text-zinc-400">{t("Өөрийн MT5 дээрх роботыг эндээс асааж, зогсоож, тохируулж, хянана. Энэ хуудас зөвхөн таных: таны токен, тохиргоо, арилжааны түүх бусад хэрэглэгчид харагдахгүй.", "Start, stop, configure and watch the robot on your own MT5 from here. This page is yours alone: other users cannot see your token, settings or trade history.")}</p>
      </div>
      <BotGuide origin={origin} hasToken={view.hasToken} online={view.online} v={v} />
      <BacktestGuide v={v} />
      <BotPanel key={view.account} initial={JSON.parse(JSON.stringify(view))} syncUrl={`${origin}/api/bot/sync`} />
      <p className="max-w-prose text-xs leading-relaxed text-zinc-500">{t("Scalper арга шалгагдаагүй: өнгөрсөн дата дээр ашигтай гэдэг нь нотлогдоогүй. Ашиг баталгаагүй, алдагдал хүлээх эрсдэлтэй. Санхүүгийн зөвлөгөө биш. Арилжаа таны өөрийн дансанд, таны шийдвэрээр хийгдэнэ.", "The Scalper method is unproven: it has not been shown to be profitable on past data. Profit is not guaranteed and you can lose money. Not financial advice. Trades are placed in your own account, by your own decision.")}</p>
    </div>
  );
}
