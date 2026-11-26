"use client";
import { useCallback, useEffect, useState } from "react";
import type { Levels } from "@/lib/snapshot";
import type { BotChartData } from "@/lib/botChart";
import { CandleChart } from "./CandleChart";
import { BotTradeHistory } from "./BotTradeHistory";
import { useViewer } from "./PrefsProvider";

type Payload = BotChartData & { fetchedAt: number; account: string | null; accounts: { login: string; label: string; mode: string | null }[] };
const REFRESH_MS = 15_000;

/** The chart and the robot's history under it: one account's trades, refreshed while the page is open. */
export function ChartWorkspace({ levels }: { levels: Levels | null }) {
  const { t } = useViewer();
  const [data, setData] = useState<Payload | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ at: number; n: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/bot/trades${account ? `?account=${encodeURIComponent(account)}` : ""}`, { cache: "no-store" });
      if (r.ok) setData({ ...((await r.json()) as Omit<Payload, "fetchedAt">), fetchedAt: Date.now() });
    } catch { /* offline: the next round tries again */ }
  }, [account]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load, then every 15 s while visible
    void load();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const bot = data && data.account ? { trades: data.trades, open: data.open } : null;
  return (
    <div className="space-y-5 sm:space-y-6">
      {data && data.accounts.length > 1 && (
        <nav aria-label={t("MT5 данс", "MT5 account")} className="flex flex-wrap gap-2">
          {data.accounts.map((a) => (
            <button key={a.login} type="button" onClick={() => setAccount(a.login)} aria-pressed={a.login === data.account}
              className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm ${a.login === data.account ? "border-amber-400 bg-zinc-800 font-semibold text-zinc-50" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>
              <span className="tabular-nums">{a.label}</span>
              {a.mode === "REAL" && <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-xs font-semibold text-red-400">{t("Жинхэнэ", "Real")}</span>}
              {a.mode === "DEMO" && <span className="rounded-md bg-zinc-700/60 px-1.5 py-0.5 text-xs font-semibold text-zinc-300">{t("Демо", "Demo")}</span>}
            </button>
          ))}
        </nav>
      )}
      <CandleChart levels={levels} bot={bot} focus={focus} />
      {data && (data.account
        ? <BotTradeHistory trades={data.trades} now={data.fetchedAt} onPick={(at) => { setFocus((f) => ({ at, n: (f?.n ?? 0) + 1 })); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        : <section aria-labelledby="history-h" className="space-y-2"><h2 id="history-h" className="text-lg font-semibold text-zinc-100">{t("Ботын түүх", "Bot history")}</h2><p className="card text-sm text-zinc-400">{t("MT5 робот холбогдоогүй байна. Бот хуудаснаас холбовол арилжаа бүр нь чарт дээр болон энд ашиг, алдагдалтайгаа гарна.", "No MT5 robot is connected. Connect it on the Bot page and every trade shows on the chart and here, with its profit or loss.")}</p></section>)}
    </div>
  );
}
