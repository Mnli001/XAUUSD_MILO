import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { getT } from "@/lib/prefs.server";
import { Station } from "@/components/Timetable";

export const dynamic = "force-dynamic";

export default async function BotResearchPage() {
  await requireAdmin(); // the layout's check does not guard this page: layouts do not re-run on navigation
  const t = await getT();
  const stops: [string, string, string][] = [
    ["/admin/bot/backtest", "Backtest", t("Дүрмийг өнгөрсөн дата дээр шалгах.", "Test a rule on past data.")],
    ["/admin/bot/paper", t("Цаасан арилжаа", "Paper trading"), t("Сонгосон дүрмийг урагшаа, мөнгөгүйгээр шалгах.", "Test the chosen rule going forward, without money.")],
  ];
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Ботын судалгаа", "Bot research")}</h1>
        <p className="page-lede">{t("Ботыг удирдах хуудас хэрэглэгч бүрд тусдаа болсон:", "The page for running the bot is now separate for each user:")} <Link href="/bot" className="font-medium text-zinc-100 underline decoration-amber-400 decoration-2">{t("Бот", "Bot")}</Link>{t(". Энд зөвхөн дүрмийн судалгаа байна.", ". Only rule research is here.")}</p>
      </div>
      {/* The two research steps as stops on one line: the past first, then forward. */}
      <nav aria-label={t("Ботын судалгаа", "Bot research")} className="table-card max-w-2xl">
        <ol className="relative">
          <span aria-hidden className="pointer-events-none absolute top-8 bottom-8 left-[21px] z-[1] w-[3px] rounded-full bg-zinc-800 sm:left-[25px]" />
          {stops.map(([href, title, about]) => (
            <li key={href} className="border-t border-zinc-800/70 first:border-t-0">
              <Link href={href} className="relative flex items-center gap-3.5 px-4 py-4 transition-colors hover:bg-zinc-800/50 sm:px-5">
                <Station className="relative z-10" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-zinc-100">{title}</span>
                  <span className="mt-0.5 block text-sm text-zinc-400">{about}</span>
                </span>
                <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-zinc-500"><path d="M4.5 2.5 8 6 4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
