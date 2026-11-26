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
    <div className="reveal space-y-4 sm:space-y-5">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] leading-tight text-zinc-50 sm:text-[32px]">{t("Бот", "Bot")}</h1>
          <p className="mt-1 max-w-prose text-sm text-zinc-500">{t("Өөрийн MT5 дээрх роботыг асааж, зогсоож, тохируулж, хянана. Таны токен, тохиргоо, түүх зөвхөн танд харагдана.", "Start, stop, configure and watch the robot on your own MT5. Your token, settings and history are yours alone.")}</p>
        </div>
        <Link href="/bot/history" className="btn-ghost ml-auto">{t("Дохионы түүх", "Signal history")}</Link>
      </header>

      {paid && view ? (
        <>
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
