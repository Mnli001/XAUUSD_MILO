import { requireUser } from "@/lib/auth";
import { getT, getViewer } from "@/lib/prefs.server";
import { paywallFor } from "@/lib/paywall.server";
import { getManualTrade, journalLogins, listJournal } from "@/lib/journal";
import { journalStats } from "@/lib/journalStats";
import { formatTime, zoneDateKey } from "@/lib/time";
import { JournalPanel, type JournalFilter } from "@/components/JournalView";
import type { EntryValues } from "@/components/JournalEntryForm";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Арилжааны журнал", "Trade journal") };
}

type Params = { src?: string; days?: string; login?: string; edit?: string };

/*
 * The journal is open to every signed-in member: trades written down by hand are theirs, plan or not, and get the same
 * analysis. The trades the robot reports from the MT5 account are loaded only with a plan, as before.
 */
export default async function JournalPage({ searchParams }: { searchParams: Promise<Params> }) {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const { paid } = paywallFor(user);
  const p = await searchParams;
  const logins = paid ? await journalLogins(user.id) : [];
  const filter: JournalFilter = {
    src: p.src === "manual" || p.src === "robot" ? p.src : "all",
    days: p.days === "30" || p.days === "all" ? p.days : "90",
    login: p.login && logins.includes(p.login) ? p.login : "",
  };
  const now = new Date();
  const [rows, editRow] = await Promise.all([
    listJournal(user.id, { source: filter.src, login: filter.login || undefined, from: filter.days === "all" ? undefined : new Date(now.getTime() - Number(filter.days) * 864e5), origins: paid ? undefined : ["web"] }),
    p.edit ? getManualTrade(user.id, p.edit) : Promise.resolve(null),
  ]);
  const initial: EntryValues | null = editRow && {
    ticket: editRow.ticket, date: zoneDateKey(editRow.openTime, v.timeZone), openAt: formatTime(editRow.openTime, v.timeZone),
    closeAt: editRow.closeTime.getTime() === editRow.openTime.getTime() ? "" : formatTime(editRow.closeTime, v.timeZone),
    side: editRow.side === "SELL" ? "SELL" : "BUY", openPrice: String(editRow.openPrice), closePrice: String(editRow.closePrice), lots: String(editRow.lots),
    stopLoss: editRow.stopLoss === null ? "" : String(editRow.stopLoss), note: editRow.note ?? "",
  };
  return (
    <div className="reveal space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Арилжааны журнал", "Trade journal")}</h1>
        <p className="page-lede">{t("Арилжаагаа гараар бичих эсвэл MT5 дансны хаасан trade-үүдээ робот автоматаар илгээх: хоёулаа нэг анализад орж, хаана ашиг, хаана алдагдал гарч байгааг харуулна.", "Write your trades down by hand, or let the robot send your MT5 account's closed trades: both go into one analysis that shows where you make and lose money.")}</p>
      </div>
      <JournalPanel rows={rows} s={journalStats(rows, v)} v={v} filter={filter} logins={logins} manual={{ today: zoneDateKey(now, v.timeZone), initial }} locked={!paid} />
    </div>
  );
}
