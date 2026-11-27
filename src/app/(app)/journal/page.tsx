import { requireUser } from "@/lib/auth";
import { getT, getViewer } from "@/lib/prefs.server";
import { paywallFor } from "@/lib/paywall.server";
import { PlansCard } from "@/components/Paywall";
import { choosePlanAction } from "@/lib/actions/payments";
import { journalLogins, listJournal } from "@/lib/journal";
import { journalStats } from "@/lib/journalStats";
import { JournalPanel, type JournalFilter } from "@/components/JournalView";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Арилжааны журнал", "Trade journal") };
}

type Params = { src?: string; days?: string; login?: string };

export default async function JournalPage({ searchParams }: { searchParams: Promise<Params> }) {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const { paid, payOn, contact } = paywallFor(user);
  const p = await searchParams;
  const logins = paid ? await journalLogins(user.id) : [];
  const filter: JournalFilter = {
    src: p.src === "manual" || p.src === "robot" ? p.src : "all",
    days: p.days === "30" || p.days === "all" ? p.days : "90",
    login: p.login && logins.includes(p.login) ? p.login : "",
  };
  const now = new Date();
  const rows = paid ? await listJournal(user.id, { source: filter.src, login: filter.login || undefined, from: filter.days === "all" ? undefined : new Date(now.getTime() - Number(filter.days) * 864e5) }) : [];
  return (
    <div className="reveal space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Арилжааны журнал", "Trade journal")}</h1>
        <p className="page-lede">{t("MT5 дансны тань хаасан trade-үүд автоматаар энд ирж, хаана ашиг, хаана алдагдал гарч байгааг харуулна.", "Your MT5 account's closed trades arrive here on their own, showing where you make and lose money.")}</p>
      </div>
      {paid ? <JournalPanel rows={rows} s={journalStats(rows, v)} v={v} filter={filter} logins={logins} /> : <PlansCard t={t} choose={choosePlanAction} payOn={payOn} contact={contact} />}
    </div>
  );
}
