"use client";
import { useEffect, useState } from "react";
import { CONTRACT, marginFor, pnl, riskLots, type OrderType, type Side } from "@/lib/demo/engine";
import type { DemoView } from "@/lib/demo/view";
import { TermHint } from "../TermHint";
import { useViewer } from "../PrefsProvider";
import { cash, demoAction, errorText, num, px, usd } from "./common";

type Price = { bid: number; ask: number } | null;
const SL_STEPS = [3, 5, 10];
const RR_STEPS = [1, 2, 3];
const RISK_STEPS = [0.5, 1, 2];
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The order ticket: side, market or pending, size, stop and target, with what the trade risks and needs in
 * margin worked out before it is sent. For a beginner, a trade with warnings waits for a second press.
 */
export function OrderTicket({ view, price, now, nextHigh, picked, onDone }: {
  view: DemoView; price: Price; now: number; nextHigh: number | null; picked: { price: number; n: number } | null;
  onDone: (view: DemoView, message: string) => void;
}) {
  const { t } = useViewer();
  const beginner = view.account.beginner;
  const [side, setSide] = useState<Side>("BUY");
  const [type, setType] = useState<OrderType>("MARKET");
  const [at, setAt] = useState("");
  const [lots, setLots] = useState("0.01");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A click on the chart: its price becomes the order's price, as a limit or a stop by where it is.
  useEffect(() => {
    if (!picked || !price) return;
    const p = picked.price;
    /* eslint-disable react-hooks/set-state-in-effect -- a click on the chart sets the form */
    setAt(p.toFixed(2));
    setType(side === "BUY" ? (p < price.ask ? "LIMIT" : "STOP") : (p > price.bid ? "LIMIT" : "STOP"));
    setConfirm(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new click, not every tick
  }, [picked]);

  const entry = type === "MARKET" ? (price ? (side === "BUY" ? price.ask : price.bid) : null) : num(at);
  const nLots = num(lots) ?? 0;
  const nSl = num(sl), nTp = num(tp);
  const lev = view.account.leverage;
  const equity = view.state.equity;
  const margin = entry ? marginFor(nLots, entry, lev) : 0;
  const risk = entry && nSl !== null ? -pnl(side, nLots, entry, nSl) : null;
  const reward = entry && nTp !== null ? pnl(side, nLots, entry, nTp) : null;
  const riskPct = risk !== null && equity > 0 ? (risk / equity) * 100 : null;
  const rr = risk !== null && reward !== null && risk > 0 && reward > 0 ? reward / risk : null;
  const perDollar = round2(nLots * CONTRACT);
  const levelAfter = view.state.margin + margin > 0 ? (equity / (view.state.margin + margin)) * 100 : null;

  const warnings: string[] = [];
  if (risk !== null && risk <= 0) warnings.push(t(`SL буруу талд байна: ${side}-д үнээс ${side === "BUY" ? "доор" : "дээр"} тавина.`, `The stop is on the wrong side: for a ${side} it goes ${side === "BUY" ? "below" : "above"} the price.`));
  if (reward !== null && reward <= 0) warnings.push(t(`TP буруу талд байна: ${side}-д үнээс ${side === "BUY" ? "дээр" : "доор"} тавина.`, `The target is on the wrong side: for a ${side} it goes ${side === "BUY" ? "above" : "below"} the price.`));
  if (nSl === null) warnings.push(t("SL тавиагүй байна. SL-гүй арилжаа бол данс шатаах хамгийн түгээмэл шалтгаан.", "No stop loss. Trading without one is the most common way accounts blow up."));
  if (riskPct !== null && riskPct > 2.005) warnings.push(t(`Энэ арилжаа дансны ${riskPct.toFixed(1)}%-ийг эрсдэлд оруулж байна. Ихэнх trader нэг арилжаанд 1–2%-аас илүү эрсдэл гаргадаггүй.`, `This trade risks ${riskPct.toFixed(1)}% of the account. Most traders risk 1–2% at most per trade.`));
  if (rr !== null && rr < 1) warnings.push(t(`R:R 1:${rr.toFixed(2)} — хожвол алдахаасаа бага олно.`, `R:R 1:${rr.toFixed(2)}: a win pays less than a loss costs.`));
  if (levelAfter !== null && levelAfter < 200) warnings.push(t(`Нээсний дараа margin level ${levelAfter.toFixed(0)}% болно. 100%-д margin call, 50%-д stop-out.`, `After this the margin level is ${levelAfter.toFixed(0)}%. Margin call at 100%, stop-out at 50%.`));
  if (nextHigh !== null && now > 0 && nextHigh - now < 30 * 60_000 && nextHigh > now) warnings.push(t("30 минутын дотор чухал мэдээ гарна. Мэдээний үеэр үнэ хэдэн долларын дүүлэлт хийж, SL-ийг алгасч болно.", "A key release is less than 30 minutes away. Around news the price can jump several dollars and skip past a stop."));

  const setSlDist = (d: number) => { if (entry) setSl((side === "BUY" ? entry - d : entry + d).toFixed(2)); };
  const setRr = (k: number) => { if (entry && nSl !== null) setTp((side === "BUY" ? entry + k * Math.abs(entry - nSl) : entry - k * Math.abs(entry - nSl)).toFixed(2)); };
  const setRisk = (pct: number) => { if (entry && nSl !== null) { const l = riskLots(equity, pct, entry, nSl); if (l > 0) setLots(l.toFixed(2)); } };
  const step = (d: number) => setLots(Math.max(0.01, round2((num(lots) ?? 0) + d)).toFixed(2));

  async function send() {
    if (beginner && warnings.length && !confirm) return setConfirm(true);
    setBusy(true);
    setError(null);
    const r = await demoAction({ action: "order", account: view.account.id, side, type, lots: nLots, price: type === "MARKET" ? null : num(at), sl: nSl, tp: nTp, note: note.trim() || null });
    setBusy(false);
    setConfirm(false);
    if (r.error || !r.view) return setError(errorText(r.error, t));
    setNote("");
    onDone(r.view, type === "MARKET"
      ? t(`${side} ${nLots.toFixed(2)} lot нээгдлээ`, `${side} ${nLots.toFixed(2)} lots opened`)
      : t(`${side} ${type === "LIMIT" ? "Limit" : "Stop"} ${px(num(at) ?? 0)}-д тавигдлаа`, `${side} ${type === "LIMIT" ? "Limit" : "Stop"} placed at ${px(num(at) ?? 0)}`));
  }

  const spread = price ? round2(price.ask - price.bid) : null;
  const sideBtn = (s: Side) => {
    const on = side === s;
    const buy = s === "BUY";
    const p = price ? (buy ? price.ask : price.bid) : null;
    return (
      <button type="button" onClick={() => { if (!on) { setSl(""); setTp(""); } setSide(s); setConfirm(false); }} aria-pressed={on}
        className={`flex min-h-16 flex-col items-center justify-center rounded-xl border-2 px-2 transition-colors ${on ? (buy ? "border-emerald-500 bg-emerald-500/15" : "border-red-500 bg-red-500/15") : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"}`}>
        <span className={`text-xs font-bold tracking-wide ${buy ? "text-emerald-400" : "text-red-400"}`}>{buy ? "BUY" : "SELL"}</span>
        <span className="text-lg font-semibold text-zinc-50 tabular-nums">{p !== null ? px(p) : "—"}</span>
        <span className="text-xs text-zinc-500">{buy ? "ask" : "bid"}</span>
      </button>
    );
  };
  const typeLabel = (k: OrderType) => (k === "MARKET" ? "Market" : k === "LIMIT" ? "Limit" : "Stop");
  const small = "min-h-8 rounded-lg border border-zinc-700 px-2.5 text-xs font-semibold text-zinc-300 hover:border-zinc-500 disabled:opacity-40";

  return (
    <section className="card space-y-4" aria-labelledby="ticket-h">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="ticket-h" className="text-base font-semibold text-zinc-50">{t("Захиалга", "New order")} · XAUUSD</h2>
        {spread !== null && <span className="text-xs text-zinc-500 tabular-nums">Spread {spread.toFixed(2)} <TermHint id="spread" /></span>}
      </div>
      <div className="grid grid-cols-2 gap-2">{sideBtn("SELL")}{sideBtn("BUY")}</div>

      <div role="group" aria-label={t("Захиалгын төрөл", "Order type")} className="grid grid-cols-3 rounded-xl border border-zinc-800 bg-zinc-950 p-1">
        {(["MARKET", "LIMIT", "STOP"] as const).map((k) => (
          <button key={k} type="button" onClick={() => { setType(k); setConfirm(false); }} aria-pressed={type === k}
            style={type === k ? { background: "var(--accent-bg)", color: "var(--accent-fg)" } : undefined}
            className={`min-h-9 rounded-lg text-sm ${type === k ? "font-bold" : "font-medium text-zinc-400 hover:text-zinc-100"}`}>{typeLabel(k)}</button>
        ))}
      </div>
      {type !== "MARKET" && (
        <div>
          <label htmlFor="t-price" className="label">{t(`${side} ${typeLabel(type)} үнэ`, `${side} ${typeLabel(type)} price`)}</label>
          <input id="t-price" className="input tabular-nums" inputMode="decimal" value={at} onChange={(e) => setAt(e.target.value)} placeholder={price ? px(side === "BUY" ? price.ask : price.bid) : ""} />
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
            {type === "LIMIT"
              ? t(side === "BUY" ? "Buy Limit: үнэ доош бууж ирээд энэ үнэд хүрэхэд худалдаж авна (хямдхан авах)." : "Sell Limit: үнэ дээш гарч ирээд энэ үнэд хүрэхэд зарна (үнэтэй зарах).", side === "BUY" ? "Buy Limit: buys when the price comes down to this level (buying cheaper)." : "Sell Limit: sells when the price comes up to this level (selling dearer).")
              : t(side === "BUY" ? "Buy Stop: үнэ энэ түвшнийг дээш эвдэхэд худалдаж авна (breakout-ын дагуу)." : "Sell Stop: үнэ энэ түвшнийг доош эвдэхэд зарна (breakout-ын дагуу).", side === "BUY" ? "Buy Stop: buys when the price breaks up through this level (following a breakout)." : "Sell Stop: sells when the price breaks down through this level (following a breakout).")}
            {" "}{t("Чарт дээр дарж үнээ сонгож болно.", "You can click the chart to pick the price.")}
          </p>
        </div>
      )}

      <div>
        <label htmlFor="t-lots" className="label">Lot <TermHint id="lot" /></label>
        <div className="flex gap-2">
          <button type="button" className={small} onClick={() => step(-0.01)} aria-label={t("Lot багасгах", "Fewer lots")}>−</button>
          <input id="t-lots" className="input text-center tabular-nums" inputMode="decimal" value={lots} onChange={(e) => setLots(e.target.value)} />
          <button type="button" className={small} onClick={() => step(0.01)} aria-label={t("Lot нэмэх", "More lots")}>+</button>
        </div>
        <p className="mt-1.5 text-xs text-zinc-500 tabular-nums">{t(`Үнэ $1 хөдлөхөд ±$${perDollar} · margin ${cash(margin)}`, `$1 move = ±$${perDollar} · margin ${cash(margin)}`)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="t-sl" className="label">Stop loss <TermHint id="stop-loss" /></label>
          <input id="t-sl" className="input tabular-nums" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} placeholder={t("үнэ", "price")} />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {SL_STEPS.map((d) => <button key={d} type="button" className={small} disabled={!entry} onClick={() => setSlDist(d)}>${d}</button>)}
            {sl && <button type="button" className={small} onClick={() => setSl("")}>✕</button>}
          </div>
        </div>
        <div>
          <label htmlFor="t-tp" className="label">Take profit <TermHint id="take-profit" /></label>
          <input id="t-tp" className="input tabular-nums" inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} placeholder={t("үнэ", "price")} />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {RR_STEPS.map((k) => <button key={k} type="button" className={small} disabled={!entry || nSl === null} onClick={() => setRr(k)}>1:{k}</button>)}
            {tp && <button type="button" className={small} onClick={() => setTp("")}>✕</button>}
          </div>
        </div>
      </div>

      <div className="glass-inset space-y-2 px-3.5 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-400">{t("Эрсдэлээр lot тооцох", "Size by risk")}:</span>
          {RISK_STEPS.map((p) => <button key={p} type="button" className={small} disabled={!entry || nSl === null} onClick={() => setRisk(p)}>{p}%</button>)}
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
          <dt className="text-zinc-500">{t("SL-д хүрвэл", "At the stop")}</dt>
          <dd className="text-right text-red-400">{risk !== null && risk > 0 ? `${usd(-risk)} (${riskPct!.toFixed(2)}%)` : "—"}</dd>
          <dt className="text-zinc-500">{t("TP-д хүрвэл", "At the target")}</dt>
          <dd className="text-right text-emerald-400">{reward !== null && reward > 0 ? usd(reward) : "—"}</dd>
          <dt className="text-zinc-500">R:R <TermHint id="rr" /></dt>
          <dd className="text-right text-zinc-200">{rr !== null ? `1:${rr.toFixed(2)}` : "—"}</dd>
          <dt className="text-zinc-500">Free margin</dt>
          <dd className={`text-right ${view.state.free - margin < 0 ? "text-red-400" : "text-zinc-200"}`}>{cash(view.state.free - margin)}</dd>
        </dl>
      </div>

      <div>
        <label htmlFor="t-note" className="label">{t("Яагаад энэ арилжааг хийж байна вэ?", "Why are you taking this trade?")} <span className="font-normal text-zinc-500">{t("(заавал биш)", "(optional)")}</span></label>
        <textarea id="t-note" className="input min-h-16" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={t("Жишээ: 1H trend дээшээ, EMA 50 дээр буцаж ирсэн, SL сүүлийн low-ийн доор", "e.g. 1H trend up, pulled back to EMA 50, stop under the last low")} />
      </div>

      {beginner && warnings.length > 0 && (
        <ul className="space-y-1.5 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-100" aria-label={t("Анхааруулга", "Warnings")}>
          {warnings.map((w) => <li key={w} className="flex gap-2"><span aria-hidden>⚠</span><span>{w}</span></li>)}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {!price && <p className="text-sm text-zinc-400">{t("Live үнэ ирэхгүй байгаа тул арилжаа түр хаалттай.", "Trading is paused while the live price is not coming in.")}</p>}

      <button type="button" onClick={send} disabled={busy || !price || !(nLots > 0) || (type !== "MARKET" && !num(at))}
        className={`min-h-12 w-full rounded-xl text-base font-bold text-white transition-colors disabled:opacity-40 ${side === "BUY" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500"}`}>
        {busy ? t("Илгээж байна…", "Sending…")
          : confirm ? t("Анхааруулгыг ойлгосон, нээх", "I understand, place it")
          : `${side} ${nLots.toFixed(2)} ${type === "MARKET" ? (entry ? `@ ${px(entry)}` : "") : `${typeLabel(type)} @ ${num(at) !== null ? px(num(at)!) : "…"}`}`}
      </button>
      {confirm && <button type="button" className="btn-ghost w-full" onClick={() => setConfirm(false)}>{t("Буцаад засах", "Go back and change it")}</button>}
    </section>
  );
}
