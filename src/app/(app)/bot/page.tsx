import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { getLiveView } from "@/lib/bot/liveDb";
import { BotPanel } from "@/components/BotPanel";
import { BotGuide } from "@/components/BotGuide";

export const dynamic = "force-dynamic";
export const metadata = { title: "Бот — XAU Analytics" };

export default async function BotPage() {
  const user = await requireUser();
  const view = await getLiveView(user.id, new Date());
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Бот</h1>
        <p className="mt-1 max-w-prose text-sm text-zinc-400">Өөрийн MT5 дээрх роботыг эндээс асааж, зогсоож, тохируулж, хянана. Энэ хуудас зөвхөн таных: таны токен, тохиргоо, арилжааны түүх бусад хэрэглэгчид харагдахгүй.</p>
      </div>
      <BotGuide origin={origin} hasToken={view.hasToken} online={view.online} />
      <BotPanel initial={JSON.parse(JSON.stringify(view))} syncUrl={`${origin}/api/bot/sync`} />
      <p className="max-w-prose text-xs leading-relaxed text-zinc-500">Scalper арга шалгагдаагүй: өнгөрсөн дата дээр ашигтай гэдэг нь нотлогдоогүй. Ашиг баталгаагүй, алдагдал хүлээх эрсдэлтэй. Санхүүгийн зөвлөгөө биш. Арилжаа таны өөрийн дансанд, таны шийдвэрээр хийгдэнэ.</p>
    </div>
  );
}
