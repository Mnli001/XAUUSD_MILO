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
  const { paid, payOn, contact } = paywallFor(user);
  // Without a plan nothing about a robot (token, accounts, history) is loaded or shown.
  const view = paid ? await getLiveView(user.id, new Date(), typeof account === "string" ? account : undefined) : null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  return (
    <div className="reveal space-y-4 sm:space-y-5">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] leading-tight text-zinc-50 sm:text-[32px]">{t("Бот", "Bot")}</h1>
          <p className="mt-1 max-w-prose text-sm text-zinc-500">{t("Өөрийн MT5 дээрх роботыг асааж, зогсоож, тохируулж, хянана. Таны токен, тохиргоо, түүх зөвхөн танд харагдана.", "Start, stop, configure and watch the robot on your own MT5. Your token, settings and history are yours alone.")}</p>
        </div>
        <Link href="/bot/history" className="btn-ghost ml-auto">{t("Ботын түүх", "Bot history")}</Link>
      </header>

      {paid && view ? (
        <>
      {/* Status and controls first; the setup manual follows and opens on its own only until the robot is connected. */}
      <BotPanel key={view.account} initial={JSON.parse(JSON.stringify(view))} syncUrl={`${origin}/api/bot/sync`} />
      <BotGuide origin={origin} hasToken={view.hasToken} online={view.online} v={v} />
      <BacktestGuide v={v} />
        </>
      ) : (
        <PlansCard t={t} choose={choosePlanAction} payOn={payOn} contact={contact} />
      )}
    </div>
  );
}
