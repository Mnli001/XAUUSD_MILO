import Link from "next/link";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { getLiveView } from "@/lib/bot/liveDb";
import { BotPanel } from "@/components/BotPanel";
import { BotGuide, BacktestGuide } from "@/components/BotGuide";
import { getT, getViewer } from "@/lib/prefs.server";
import { paywallFor } from "@/lib/paywall.server";
import { PlansCard } from "@/components/Paywall";
import { choosePlanAction } from "@/lib/actions/payments";
import { minRobotVersion, type BotMode } from "@/lib/bot/live";
import { BROKER_RECORD, describe } from "@/lib/setup/build";
import { SESSION_RULES } from "@/lib/setup/sessionRules";
import { ruleLine, type BrokerRecord } from "@/lib/siteCopy";
import type { Viewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Бот", "Bot") };
}

const MODES: BotMode[] = ["DAY", "READING", "BASKET", "ASIAN"];
/** The robot file each tool needs, from the server's own constants, so the panel and the server agree. */
const robotNeeds = () => {
  const need = Object.fromEntries(MODES.map((m) => [m, minRobotVersion(m)]));
  return { need, latest: Math.max(...Object.values(need)) };
};
/** The Setup signals tool's text: the same rules and names as the Setup page, and the one dated research record. */
const setupToolText = (v: Viewer) => ({
  lines: SESSION_RULES.map((r) => ruleLine(r, describe(r, v).name, v)),
  record: BROKER_RECORD as BrokerRecord,
});

export default async function BotPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const { account } = await searchParams;
  const { paid, payOn, contact } = paywallFor(user);
  // Without a plan nothing about a robot (token, accounts, history) is loaded or shown.
  const view = paid ? await getLiveView(user.id, new Date(), typeof account === "string" ? account : undefined) : null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  return (
    <div className="reveal space-y-5 sm:space-y-7">
      <div className="card group relative overflow-hidden sm:p-8">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blue-500/5 blur-3xl transition-all duration-700 group-hover:scale-150 group-hover:bg-blue-500/10" aria-hidden />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <svg className="h-7 w-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            <h1 className="page-title">{t("Бот", "Bot")}</h1>
            <Link href="/bot/history" className="btn ml-auto">{t("Дохионы түүх", "Signal history")}</Link>
          </div>
          <p className="page-lede mt-4">{t("Өөрийн MT5 дээрх роботыг эндээс асааж, зогсоож, тохируулж, хянана. Энэ хуудас зөвхөн таных: таны токен, тохиргоо, арилжааны түүх бусад хэрэглэгчид харагдахгүй.", "Start, stop, configure and watch the robot on your own MT5 from here. This page is yours alone: other users cannot see your token, settings or trade history.")}</p>
          
          <div className="mt-5 flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 py-2 backdrop-blur-sm">
              <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-sm font-bold text-blue-300">{t("Хувийн дата", "Private Data")}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 backdrop-blur-sm">
              <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-sm font-bold text-emerald-300">{t("Шууд холболт", "Direct Connection")}</span>
            </div>
          </div>
        </div>
      </div>
      
      {paid && view ? (
        <>
      <div role="note" className="group relative overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/15 to-amber-400/5 p-5 backdrop-blur-sm transition-all duration-500 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-400/10 sm:p-6">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-400/10 blur-3xl transition-all duration-700 group-hover:scale-150" aria-hidden />
        
        <div className="relative z-10 flex gap-4">
          <div className="shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/20 backdrop-blur-sm">
              <svg className="h-6 w-6 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-amber-200">{t("Анхааруулга: Эрсдэлтэй", "Warning: Risk Involved")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-200/90">
              {t("Бот таны MT5 дансанд жинхэнэ арилжаа хийнэ. Хэрэгсэл бүрийн өнгөрсөн дата дээрх үр дүн ирээдүйн ашгийг баталгаажуулахгүй, алдагдал хүлээж болно. Эхлээд demo дансанд туршаад үзээрэй. Санхүүгийн зөвлөгөө биш; арилжаа таны дансанд, таны шийдвэрээр хийгдэнэ.", "The bot places real trades in your MT5 account. How a tool did on past data does not guarantee future profit, and you can lose money. Try it on a demo account first. Not financial advice; trades are placed in your own account, by your own decision.")}
            </p>
          </div>
        </div>
      </div>
      {/* Status and controls first; the setup manual follows and opens on its own only until the robot is connected. */}
      <BotPanel key={view.account} initial={JSON.parse(JSON.stringify(view))} syncUrl={`${origin}/api/bot/sync`} robot={robotNeeds()} setup={setupToolText(v)} />
      <BotGuide origin={origin} hasToken={view.hasToken} online={view.online} v={v} record={BROKER_RECORD} />
      <BacktestGuide v={v} />
        </>
      ) : (
        <PlansCard t={t} choose={choosePlanAction} payOn={payOn} contact={contact} />
      )}
    </div>
  );
}
