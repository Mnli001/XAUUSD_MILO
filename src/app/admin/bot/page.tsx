import Link from "next/link";
import { getT } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";

export default async function BotResearchPage() {
  const t = await getT();
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("Ботын судалгаа", "Bot research")}</h1>
      <p className="text-sm text-zinc-400">{t("Ботыг удирдах хуудас хэрэглэгч бүрд тусдаа болсон:", "The page for running the bot is now separate for each user:")} <Link href="/bot" className="text-amber-400">{t("Бот", "Bot")}</Link>{t(". Энд зөвхөн дүрмийн судалгаа байна.", ". Only rule research is here.")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/bot/backtest" className="card hover:border-zinc-600"><div className="font-medium">Backtest</div><p className="mt-1 text-sm text-zinc-400">{t("Дүрмийг өнгөрсөн дата дээр шалгах.", "Test a rule on past data.")}</p></Link>
        <Link href="/admin/bot/paper" className="card hover:border-zinc-600"><div className="font-medium">{t("Цаасан арилжаа", "Paper trading")}</div><p className="mt-1 text-sm text-zinc-400">{t("Сонгосон дүрмийг урагшаа, мөнгөгүйгээр шалгах.", "Test the chosen rule going forward, without money.")}</p></Link>
      </div>
    </div>
  );
}
