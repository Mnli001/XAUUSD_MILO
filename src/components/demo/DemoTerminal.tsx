"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Levels } from "@/lib/snapshot";
import { accountState, closePriceFor, pnl } from "@/lib/demo/engine";
import type { DemoView } from "@/lib/demo/view";
import { journalStats, type JRow } from "@/lib/journalStats";
import { useQuote } from "@/lib/liveClient";
import { CandleChart, type ChartLine } from "../CandleChart";
import type { Plan } from "../chart/DrawingLayer";
import { JournalSummary } from "../JournalView";
import { LiveBadge } from "../LiveQuote";
import { useViewer } from "../PrefsProvider";
import { usePoll } from "../usePoll";
import { cash, reasonText, tone, usd } from "./common";
import { DemoAccountTab } from "./DemoAccountTab";
import { DemoGuide, DemoMissions } from "./DemoLearn";
import { DemoOpenForm } from "./DemoOpenForm";
import { HistoryTable, PendingTable, PositionsTable } from "./DemoTables";
import { OrderTicket } from "./OrderTicket";

type Tab = "positions" | "pending" | "history" | "stats" | "account";
export type DemoContext = { bias: { label: string; buyerPct: number } | null; next: { title: string; at: number } | null };

/** The demo trading terminal: account figures, the live chart, the order ticket, and the trades. */
export function DemoTerminal({ accounts, initial, levels, context }: { accounts: { id: string; name: string }[]; initial: string; levels: Levels | null; context: DemoContext }) {
  const v = useViewer();
  const { t } = v;
  const router = useRouter();
  const [accountId, setAccountId] = useState(initial);
  const [view, setView] = useState<DemoView | null>(null);
  const [tab, setTab] = useState<Tab>("positions");
  const [opening, setOpening] = useState(false);
  const [picked, setPicked] = useState<{ price: number; n: number } | null>(null);
  const [plan, setPlan] = useState<{ side: "BUY" | "SELL"; entry: number; sl: number; tp: number; n: number } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string; tone: number }[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const quote = useQuote();

  const toast = useCallback((text: string, tn = 0) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-2), { id, text, tone: tn }]);
    window.setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 5000);
  }, []);

  // A trade the price closed (stop, target, stop-out) or a pending order that filled between two looks is announced.
  const take = useCallback((next: DemoView, announce: boolean) => {
    const ids = new Set(next.history.map((h) => h.id));
    if (announce && seen.current) {
      for (const h of next.history) {
        if (!seen.current.has(h.id) && h.closeReason !== "MANUAL") toast(`${reasonText(h.closeReason, t)}: ${h.side} ${h.lots.toFixed(2)} ${usd(h.profit ?? 0)}`, h.profit ?? 0);
      }
    }
    seen.current = ids;
    setView(next);
  }, [t, toast]);

  const load = useCallback(async () => {
    const r = await fetch(`/api/demo/state?account=${encodeURIComponent(accountId)}`, { cache: "no-store" });
    if (r.ok) take((await r.json()) as DemoView, true);
  }, [accountId, take]);
  useEffect(() => { seen.current = null; }, [accountId]);
  usePoll(load, 2000);

  const onDone = useCallback((next: DemoView, message: string) => { take(next, false); toast(message); }, [take, toast]);

  const price = quote?.live && quote.bid && quote.ask ? { bid: quote.bid, ask: quote.ask } : view?.price ?? null;
  const st = view ? accountState(view.account.balance, view.account.leverage, view.positions.map((p) => ({ side: p.side, lots: p.lots, openPrice: p.openPrice! })), price) : null;

  const bot = useMemo(() => view ? {
    trades: view.history.slice(0, 300).map((h) => ({ ticket: h.id, side: h.side, lots: h.lots, openPrice: h.openPrice!, closePrice: h.closePrice!, profit: h.profit ?? 0, openedAt: h.openedAt ? new Date(h.openedAt).toISOString() : null, closedAt: new Date(h.closedAt!).toISOString() })),
    open: view.positions.map((p) => ({ ticket: p.id, side: p.side, lots: p.lots, openPrice: p.openPrice!, sl: p.sl ?? 0, tp: p.tp ?? 0, profit: price ? pnl(p.side, p.lots, p.openPrice!, closePriceFor(p.side, price)) : 0 })),
  } : null, [view, price?.bid, price?.ask]); // eslint-disable-line react-hooks/exhaustive-deps -- the price's two numbers, not its object
  const lines: ChartLine[] = useMemo(() => (view?.pending ?? []).flatMap((o) => [
    { price: o.price!, title: `${o.side} ${o.type === "LIMIT" ? "LMT" : "STP"} ${o.lots}`, tone: o.side === "BUY" ? "up" as const : "down" as const },
    ...(o.sl !== null ? [{ price: o.sl, title: "SL", tone: "muted" as const }] : []),
    ...(o.tp !== null ? [{ price: o.tp, title: "TP", tone: "muted" as const }] : []),
  ]), [view]);
  const rows: JRow[] = useMemo(() => (view?.history ?? []).map((h) => ({ symbol: "XAUUSD", side: h.side, lots: h.lots, openPrice: h.openPrice!, closePrice: h.closePrice!, openTime: new Date(h.openedAt ?? h.closedAt!), closeTime: new Date(h.closedAt!), profit: h.profit ?? 0, magic: "0" })), [view]);
  const onPick = useCallback((p: number) => setPicked((x) => ({ price: p, n: (x?.n ?? 0) + 1 })), []);
  const onPlan = useCallback((p: Plan) => { setPlan((x) => ({ ...p, n: (x?.n ?? 0) + 1 })); toast(t("Төлөвлөгөө захиалгын хэсэгт орлоо. Lot-оо шалгаад илгээнэ үү.", "The plan is in the order ticket. Check the lots and send it.")); }, [t, toast]);

  if (opening) return <DemoOpenForm count={accounts.length} onCancel={() => setOpening(false)} onOpened={(id) => { setOpening(false); router.push(`/demo?a=${id}`); router.refresh(); setAccountId(id); }} />;
  if (!view || !st) return <div className="card text-sm text-zinc-500">{t("Ачаалж байна…", "Loading…")}</div>;

  const a = view.account;
  const fig = (label: string, value: string, cls = "text-zinc-50") => (
    <div className="min-w-0"><dt className="text-[11px] text-zinc-500">{label}</dt><dd className={`text-sm font-semibold tabular-nums sm:text-base ${cls}`}>{value}</dd></div>
  );
  const tabBtn = (k: Tab, label: string) => (
    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
      className={`min-h-11 shrink-0 border-b-2 px-3 text-sm ${tab === k ? "border-amber-400 font-semibold text-zinc-50" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}>{label}</button>
  );
  const gain = st.equity - a.startBalance;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div aria-live="polite" className="pointer-events-none fixed right-4 top-20 z-50 flex w-72 flex-col gap-2">
        {toasts.map((x) => <p key={x.id} className={`pointer-events-auto rounded-xl border bg-zinc-900 px-4 py-3 text-sm shadow-lg ${x.tone > 0 ? "border-emerald-500/50 text-emerald-200" : x.tone < 0 ? "border-red-500/50 text-red-200" : "border-zinc-700 text-zinc-100"}`}>{x.text}</p>)}
      </div>

      <section className="card space-y-3" aria-label={t("Данс", "Account")}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="demo-acct">{t("Demo данс", "Demo account")}</label>
          <select id="demo-acct" className="input w-auto min-w-40 font-semibold" value={accountId}
            onChange={(e) => { if (e.target.value === "+") return setOpening(true); setAccountId(e.target.value); router.replace(`/demo?a=${e.target.value}`); }}>
            {accounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            {accounts.length < 3 && <option value="+">{t("+ Шинэ данс нээх", "+ Open a new account")}</option>}
          </select>
          <span className="rounded-md bg-amber-400/15 px-2 py-1 text-xs font-bold text-amber-300">DEMO · 1:{a.leverage}</span>
          <LiveBadge />
          <span className={`ml-auto text-sm tabular-nums ${tone(gain)}`}>{t("Эхэлснээс хойш", "Since the start")} {usd(gain)} ({((gain / a.startBalance) * 100).toFixed(2)}%)</span>
        </div>
        <dl className="grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-6">
          {fig(t("Баланс", "Balance"), cash(st.balance))}
          {fig("Equity", cash(st.equity))}
          {fig(t("Нээлттэй P&L", "Open P&L"), usd(st.floating), tone(st.floating))}
          {fig("Margin", cash(st.margin))}
          {fig("Free margin", cash(st.free), st.free < 0 ? "text-red-400" : "text-zinc-50")}
          {fig("Margin level", st.level === null ? "—" : `${st.level.toFixed(0)}%`, st.level !== null && st.level < 100 ? "text-red-400" : "text-zinc-50")}
        </dl>
        {st.level !== null && st.level < 100 && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{t("Margin call: margin level 100%-иас доош орлоо. 50% хүрвэл хамгийн их алдагдалтай арилжаа автоматаар хаагдана.", "Margin call: the margin level is under 100%. At 50% the worst trade is closed for you.")}</p>}
        {!price && <p className="rounded-lg bg-zinc-800/80 px-3 py-2 text-sm text-zinc-300">{t("Зах зээл хаалттай эсвэл live үнэ ирэхгүй байна, тиймээс арилжаа түр зогссон. Нээлттэй арилжаа, SL/TP болон захиалга үнэ ирэхэд үргэлжилнэ.", "The market is closed or the live price is not coming in, so trading is paused. Open trades, stops, targets and orders carry on when the price is back.")}</p>}
      </section>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <CandleChart levels={levels} bot={bot} owner="demo" lines={lines} onPickPrice={onPick} onPlan={onPlan} />
          {(context.next || context.bias) && (
            <section className="card flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label={t("Зах зээлийн нөхцөл", "Market context")}>
              {context.bias && <p className="text-zinc-300">{t("Site-ын үнэлгээ", "The site's reading")}: <b className="text-zinc-100">{context.bias.label}</b> <span className="text-zinc-500 tabular-nums">· {t("авагч", "buyers")} {context.bias.buyerPct}%</span></p>}
              {context.next && <p className="text-zinc-300">{t("Дараагийн чухал мэдээ", "Next key release")}: <b className="text-zinc-100">{context.next.title}</b> <span className="text-zinc-500 tabular-nums">· {v.dateTime(new Date(context.next.at))}</span></p>}
            </section>
          )}
        </div>
        <div className="space-y-4 sm:space-y-5">
          <OrderTicket view={{ ...view, state: st }} price={price} now={quote?.at ?? view.price?.at ?? 0} nextHigh={context.next?.at ?? null} picked={picked} plan={plan} onDone={onDone} />
          {a.beginner && <DemoMissions missions={view.missions} />}
        </div>
      </div>

      <section className="card px-0 pb-2 pt-0 sm:px-0">
        <div role="tablist" aria-label={t("Арилжаа", "Trades")} className="flex overflow-x-auto border-b border-zinc-800 px-2">
          {tabBtn("positions", t(`Нээлттэй (${view.positions.length})`, `Open (${view.positions.length})`))}
          {tabBtn("pending", t(`Захиалга (${view.pending.length})`, `Orders (${view.pending.length})`))}
          {tabBtn("history", t("Түүх", "History"))}
          {tabBtn("stats", t("Статистик", "Stats"))}
          {tabBtn("account", t("Данс", "Account"))}
        </div>
        <div role="tabpanel">
          {tab === "positions" && <PositionsTable view={view} price={price} onDone={onDone} />}
          {tab === "pending" && <PendingTable view={view} price={price} onDone={onDone} />}
          {tab === "history" && <HistoryTable view={view} />}
          {tab === "stats" && (rows.length >= 3
            ? <div className="space-y-4 p-4"><JournalSummary rows={rows} s={journalStats(rows, v)} v={v} /></div>
            : <p className="px-4 py-6 text-sm text-zinc-500">{t("Статистик 3 болон түүнээс дээш хаасан арилжаанаас эхэлж гарна. Хэдий чинээ олон арилжаа хийнэ, төдий чинээ бодит дүгнэлт гарна.", "Stats start from 3 closed trades. The more trades, the more the figures mean.")}</p>)}
          {tab === "account" && <DemoAccountTab view={view} onDone={onDone} onDeleted={() => { router.push("/demo"); router.refresh(); }} />}
        </div>
      </section>

      <DemoGuide />
    </div>
  );
}
