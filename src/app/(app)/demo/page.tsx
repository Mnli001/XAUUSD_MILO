import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { getT, getViewer } from "@/lib/prefs.server";
import { listDemoAccounts } from "@/lib/demo/demo";
import { getTodaySnapshot } from "@/lib/snapshot";
import { SYMBOL } from "@/lib/ingest/prices";
import { getNextHighEvent } from "@/lib/events";
import { biasLabelText } from "@/lib/analysis/bias";
import { eventTitle } from "@/lib/data/calendarProvider";
import { DemoTerminal } from "@/components/demo/DemoTerminal";
import { DemoOpenScreen } from "@/components/demo/DemoOpenScreen";
import { Practice } from "@/components/Practice";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Demo trade", "Demo trade") };
}

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ a?: string; tab?: string }> }) {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const now = new Date();
  const { a, tab } = await searchParams;
  const replay = tab === "replay";
  const accounts = replay ? [] : await listDemoAccounts(user.id);
  const paid = hasAccess(user, now);
  const tabs = (
    <nav aria-label={t("Demo trade", "Demo trade")} className="flex gap-2">
      {[["trade", t("Арилжаа", "Trade"), "/demo"], ["replay", "Bar replay", "/demo?tab=replay"]].map(([k, label, href]) => {
        const on = (k === "replay") === replay;
        return <Link key={k} href={href} aria-current={on ? "page" : undefined} className={`min-h-10 rounded-full border px-4 py-2 text-sm font-semibold ${on ? "border-amber-400 bg-amber-400/10 text-amber-100" : "border-zinc-700 text-zinc-400 hover:text-zinc-200"}`}>{label}</Link>;
      })}
    </nav>
  );
  const head = (
    <div className="space-y-3">
      <div>
        <h1 className="page-title">Demo trade</h1>
        <p className="page-lede">{replay
          ? t("Өнгөрсөн нэг өдрийг лаа лаагаар тоглуулж, мөнгө эрсдэлгүйгээр setup-аар орж дадлага хийнэ. Аль өдөр болохыг дуустал харуулахгүй.", "Replay a past day bar by bar and practise entering setups with no money at risk. Which day it is stays hidden until the end.")
          : t("Demo данс нээгээд XAUUSD-ийн live үнээр жинхэнэ trader шиг арилжаа хий: market ба pending захиалга, SL/TP, margin, хэсэгчлэн хаах. Мөнгө нь хуурамч, үнэ, дүрэм нь бодит.", "Open a demo account and trade XAUUSD at the live price the way a real trader does: market and pending orders, stops and targets, margin, partial closes. The money is play money; the price and the rules are real.")}</p>
      </div>
      {tabs}
    </div>
  );
  if (replay) return <div className="reveal space-y-4 sm:space-y-5">{head}<Practice /></div>;
  if (!accounts.length) return <div className="reveal space-y-4 sm:space-y-5">{head}<DemoOpenScreen /></div>;

  const current = accounts.find((x) => x.id === a) ?? accounts[0];
  const [snap, next] = await Promise.all([getTodaySnapshot(SYMBOL, now), getNextHighEvent(now)]);
  return (
    <div className="reveal space-y-4 sm:space-y-5">
      {head}
      <DemoTerminal key={current.id} accounts={accounts.map((x) => ({ id: x.id, name: x.name }))} initial={current.id} levels={paid ? snap.levels : null}
        context={{ bias: paid && snap.bias ? { label: biasLabelText(snap.bias.label, t), buyerPct: snap.bias.buyerPct } : null, next: next ? { title: eventTitle(next, t), at: next.time.getTime() } : null }} />
    </div>
  );
}
