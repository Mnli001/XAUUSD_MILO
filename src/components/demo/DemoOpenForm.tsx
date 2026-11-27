"use client";
import { useState } from "react";
import { useViewer } from "../PrefsProvider";
import { demoAction, errorText, num } from "./common";

const PRESETS = [1_000, 10_000, 100_000];
const LEVERAGES = [30, 100, 500] as const;

/** Opening a demo account: its name, the money it starts with, the leverage, and how much help the member wants. */
export function DemoOpenForm({ count, onOpened, onCancel }: { count: number; onOpened: (id: string) => void; onCancel?: () => void }) {
  const { t } = useViewer();
  const [name, setName] = useState(`Demo ${count + 1}`);
  const [amount, setAmount] = useState("10000");
  const [leverage, setLeverage] = useState<number>(100);
  const [beginner, setBeginner] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const balance = num(amount);
    if (balance === null) return setError(errorText("balance", t));
    setBusy(true);
    setError(null);
    const r = await demoAction({ action: "open", name, balance, leverage, beginner });
    setBusy(false);
    if (r.error || !r.account) return setError(errorText(r.error, t));
    onOpened(r.account.id);
  }

  const chip = (on: boolean) => `min-h-11 rounded-xl border px-4 text-sm font-semibold tabular-nums transition-colors ${on ? "border-amber-400 bg-amber-400/10 text-amber-100" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`;
  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-6" aria-labelledby="demo-open-h">
      <div>
        <h2 id="demo-open-h" className="text-xl font-semibold text-zinc-50">{t("Demo данс нээх", "Open a demo account")}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{t("Жинхэнэ мөнгө эрсдэлгүйгээр XAUUSD-ийн live үнээр арилжаа хийнэ. Broker-ийн demo данстай адил: bid/ask, spread, margin, stop-out бүгд бодитой.", "Trade XAUUSD at the live price with no real money at risk. It works like a broker's demo account: bid/ask, spread, margin and stop-out are all real.")}</p>
      </div>

      <div>
        <label htmlFor="demo-name" className="label">{t("Дансны нэр", "Account name")}</label>
        <input id="demo-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
      </div>

      <fieldset>
        <legend className="label">{t("Эхлэх мөнгө (USD)", "Starting balance (USD)")}</legend>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => setAmount(String(p))} aria-pressed={num(amount) === p} className={chip(num(amount) === p)}>${p.toLocaleString("en-US")}</button>
          ))}
          <input aria-label={t("Өөр дүн", "Other amount")} className="input w-40 tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <p className="mt-2 text-xs text-zinc-500">{t("Жинхэнэ дансандаа хэдэн төгрөг оруулахаар бодож байгаа тэр хэмжээгээр нь нээвэл дадлага хамгийн бодитой болно.", "Practice is most real with the amount you plan to put in a real account.")}</p>
      </fieldset>

      <fieldset>
        <legend className="label">Leverage</legend>
        <div className="flex flex-wrap gap-2">
          {LEVERAGES.map((l) => (
            <button key={l} type="button" onClick={() => setLeverage(l)} aria-pressed={leverage === l} className={chip(leverage === l)}>1:{l}</button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">{t(`1:${leverage} гэдэг нь $1 margin-аар $${leverage}-ийн арилжаа нээнэ гэсэн үг. 1 lot (100 унц) алт ${leverage === 30 ? "≈$13,000" : leverage === 100 ? "≈$4,000" : "≈$800"} margin шаардана. Leverage өндөр байх тусам том lot нээж болох ч данс хурдан шатна.`, `1:${leverage} means $1 of margin opens a $${leverage} trade. One lot (100 oz) of gold takes ${leverage === 30 ? "≈$13,000" : leverage === 100 ? "≈$4,000" : "≈$800"} of margin. Higher leverage lets you open bigger trades, and blows the account up faster.`)}</p>
      </fieldset>

      <fieldset>
        <legend className="label">{t("Таны туршлага", "Your experience")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { v: true, title: t("Шинээр суралцаж байна", "I'm learning"), body: t("Алхам алхмаар даалгавар, арилжаа бүрийн өмнө эрсдэлийн тайлбар, анхааруулга.", "Step-by-step tasks, the risk explained before every trade, and warnings.") },
            { v: false, title: t("Туршлагатай", "I have experience"), body: t("One-click арилжаа, анхааруулга бага.", "One-click trading, fewer prompts.") },
          ].map((o) => (
            <label key={String(o.v)} className={`cursor-pointer rounded-xl border p-3.5 ${beginner === o.v ? "border-amber-400 bg-amber-400/5" : "border-zinc-700 hover:border-zinc-500"}`}>
              <input type="radio" name="level" className="sr-only" checked={beginner === o.v} onChange={() => setBeginner(o.v)} />
              <span className="block text-sm font-semibold text-zinc-100">{o.title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-zinc-400">{o.body}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn" disabled={busy}>{busy ? t("Нээж байна…", "Opening…") : t("Demo данс нээх", "Open demo account")}</button>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>{t("Болих", "Cancel")}</button>}
      </div>
    </form>
  );
}
