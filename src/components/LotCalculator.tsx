"use client";
import { useEffect, useState } from "react";
import { lotSize } from "@/lib/lot";
import { useT } from "./PrefsProvider";

const KEY = "xau.lot.v1";
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * How many lots to trade so a stop costs a chosen share of the account. `stop`/`target`: dollars from the entry,
 * taken from the live setup when there is one (`source` names it). Balance and risk are remembered on this device.
 */
export function LotCalculator({ stop, target, source }: { stop: number | null; target: number | null; source?: string }) {
  const t = useT();
  const [balance, setBalance] = useState("");
  const [risk, setRisk] = useState("1");
  const [dist, setDist] = useState(stop === null ? "" : String(Math.round(stop * 100) / 100));
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { balance?: string; risk?: string } | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount: storage is not there during server render
      if (saved?.balance) setBalance(saved.balance);
      if (saved?.risk) setRisk(saved.risk);
    } catch { /* storage unavailable */ }
  }, []);
  const remember = (b: string, r: string) => { try { localStorage.setItem(KEY, JSON.stringify({ balance: b, risk: r })); } catch { /* storage unavailable */ } };
  const r = lotSize({ balance: Number(balance), riskPct: Number(risk), stop: Number(dist), target: stop !== null && dist === String(Math.round(stop * 100) / 100) ? target : null });
  const field = "input tabular-nums";
  return (
    <section className="card" aria-labelledby="lot-h">
      <h2 id="lot-h" className="card-title">{t("Lot тооцоолуур", "Lot calculator")}</h2>
      <p className="mt-1 text-sm text-zinc-400">
        {source ? t(`${source}-ийн stop-оор тооцов. `, `Using the stop of ${source}. `) : ""}
        {t("Stop цохигдвол дансныхаа хэдэн хувийг алдахыг та өөрөө сонгоно.", "You choose what share of the account a stop may cost.")}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="lot-balance">{t("Дансны үлдэгдэл ($)", "Account balance ($)")}</label>
          <input id="lot-balance" className={field} type="number" inputMode="decimal" min="0" step="any" value={balance} placeholder="1000"
            onChange={(e) => { setBalance(e.target.value); remember(e.target.value, risk); }} />
        </div>
        <div>
          <label className="label" htmlFor="lot-risk">{t("Эрсдэл (%)", "Risk (%)")}</label>
          <input id="lot-risk" className={field} type="number" inputMode="decimal" min="0" step="0.1" value={risk}
            onChange={(e) => { setRisk(e.target.value); remember(balance, e.target.value); }} />
        </div>
        <div>
          <label className="label" htmlFor="lot-stop">{t("Stop хүртэлх зай ($)", "Distance to stop ($)")}</label>
          <input id="lot-stop" className={field} type="number" inputMode="decimal" min="0" step="any" value={dist} placeholder="5.00"
            onChange={(e) => setDist(e.target.value)} />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-3" aria-live="polite">
        <div>
          <p className="text-xs font-semibold text-zinc-400">{t("Lot", "Lots")}</p>
          <p data-testid="lots" className="text-3xl font-semibold text-amber-300 tabular-nums">{r ? r.lots.toFixed(2) : "—"}</p>
        </div>
        {r && (
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
            <div><dt className="text-zinc-400">{t("Stop цохигдвол", "If the stop is hit")}</dt><dd className="font-semibold text-red-400">−{usd(r.risk)} ({r.riskPct}%)</dd></div>
            {r.reward !== null && <div><dt className="text-zinc-400">{t("Target-д хүрвэл", "If the target is reached")}</dt><dd className="font-semibold text-emerald-400">+{usd(r.reward)}</dd></div>}
          </dl>
        )}
      </div>
      {r?.belowMin && (
        <p role="alert" className="mt-3 text-sm text-amber-300">
          {t(`Хамгийн бага 0.01 lot ч гэсэн stop цохигдвол ${usd(r.risk)}, дансны ${r.riskPct}%-ийг алдана. Энэ арилжааг алгасах эсвэл эрсдэлээ дахин бодоорой.`, `Even the smallest size, 0.01 lot, would lose ${usd(r.risk)}, ${r.riskPct}% of the account, if the stop is hit. Consider skipping this trade or rethinking the risk.`)}
        </p>
      )}
      <p className="mt-3 text-xs text-zinc-500">{t("XAUUSD: 1 lot = 100 унц, $1 хөдөлгөөн 0.01 lot-од $1. Broker-ийн гэрээний хэмжээ өөр бол тохируулаарай. Spread, шимтгэл ороогүй.", "XAUUSD: 1 lot = 100 oz, so a $1 move is $1 per 0.01 lot. Adjust if your broker's contract size differs. Spread and fees not included.")}</p>
    </section>
  );
}
