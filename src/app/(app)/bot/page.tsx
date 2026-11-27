import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getLiveView } from "@/lib/bot/liveDb";
import { BotPanel } from "@/components/BotPanel";
import { getT, getViewer } from "@/lib/prefs.server";
import { paywallFor } from "@/lib/paywall.server";
import { PlansCard } from "@/components/Paywall";
import { choosePlanAction } from "@/lib/actions/payments";
import { minRobotVersion } from "@/lib/bot/live";
import { BROKER_RECORD, describe } from "@/lib/setup/build";
import { SESSION_RULES } from "@/lib/setup/sessionRules";
import { ruleLine, type BrokerRecord } from "@/lib/siteCopy";
import type { Viewer } from "@/lib/viewer";
import { RiskCard, type RiskView } from "@/components/RiskCard";
import { PRESETS, getRiskRule, riskReading } from "@/lib/risk";
import { siteUrl } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Робот", "Robot") };
}

/** The Setup signals' text: the same rules and names as the Setup page, and the one dated research record. */
const setupText = (v: Viewer) => ({
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
  const now = new Date();
  const view = paid ? await getLiveView(user.id, now, typeof account === "string" ? account : undefined) : null;
  const rule = view?.account ? await getRiskRule(user.id, view.account) : null;
  const risk: RiskView | null = view?.account ? {
    login: view.account,
    rule: rule && { accountSize: rule.accountSize, dailyLossPct: rule.dailyLossPct, maxLossPct: rule.maxLossPct, profitTargetPct: rule.profitTargetPct, closeOnBreach: rule.closeOnBreach },
    reading: rule && view.equity ? (({ daily, max, target }) => ({ daily, max, target }))(riskReading(rule, view.equity, now)) : null,
    breach: rule?.breach === "RISK_MAX" ? "RISK_MAX" : rule?.breach === `RISK_DAILY:${now.toISOString().slice(0, 10)}` ? "RISK_DAILY" : null,
  } : null;
  // The address the robot is told to call comes from the configuration (APP_URL / Railway's domain), never from the
  // request's Host headers, which the client controls. Unknown: "" and the address is not shown.
  const site = siteUrl();
  const origin = site ?? "";
  return (
    <div className="reveal space-y-4 sm:space-y-5">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] leading-tight text-zinc-50 sm:text-[32px]">{t("Робот", "Robot")}</h1>
          <p className="mt-1 max-w-prose text-sm text-zinc-400">{t("Робот site-ын Setup дохиог таны MT5 дээр автоматаар арилжаална: Telegram дохиотой яг адил орох үнэ, stop, target.", "The robot trades the site's Setup signals automatically on your own MT5: the same entries, stops and targets as the Telegram signals.")}</p>
        </div>
        <Link href="/bot/history" className="btn-ghost ml-auto">{t("Дохионы түүх", "Signal history")}</Link>
      </header>

      {paid && view ? (
        <>
          {/* One flow: connect (until the robot has reported), status and Start/Stop, risk, trades, then what the system does. */}
          <BotPanel key={view.account} initial={JSON.parse(JSON.stringify(view))} origin={origin} syncUrl={site ? `${site}/api/bot/sync` : ""} robot={{ need: minRobotVersion("ASIAN") }} setup={setupText(v)} installer={!!siteUrl()} />
          {risk && <RiskCard view={risk} presets={PRESETS} />}
        </>
      ) : (
        <PlansCard t={t} choose={choosePlanAction} payOn={payOn} contact={contact} />
      )}
    </div>
  );
}
