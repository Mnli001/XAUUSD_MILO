"use client";
import { useActionState, useEffect, useState } from "react";
import type { LiveView } from "@/lib/bot/liveDb";
import { saveBotConfigAction, startBotAction, stopBotAction, closeAllAction, rotateTokenAction, type BotFormState } from "@/lib/actions/bot";

type View = Omit<LiveView, "startedAt" | "stoppedAt" | "lastSeenAt" | "deals"> & {
  startedAt: string | null; stoppedAt: string | null; lastSeenAt: string | null;
  deals: (Omit<LiveView["deals"][number], "closeTime"> & { closeTime: string })[];
};

const STOP_REASON: Record<string, string> = {
  MANUAL: "гараар зогсоосон", TARGET: "ашгийн зорилтод хүрсэн", MAX_LOSS: "алдагдлын хязгаарт хүрсэн",
  TIME: "ботын тооцсон хугацаа дууссан", REVERSAL: "чиглэл эргэсэн", NO_SIGNAL: "30 минутад дохио гараагүй",
  REAL_NOT_ALLOWED: "жинхэнэ данс зөвшөөрөгдөөгүй",
};
const money = (v: number | null) => (v === null ? "—" : `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const tone = (v: number | null) => (v === null || v === 0 ? "text-zinc-200" : v > 0 ? "text-emerald-400" : "text-red-400");
const ubTime = (iso: string) => new Date(new Date(iso).getTime() + 8 * 36e5).toISOString().slice(5, 19).replace("T", " ");

export function BotPanel({ initial, syncUrl }: { initial: View; syncUrl: string }) {
  const [v, setV] = useState<View>(initial);
  const [stale, setStale] = useState(false);
  const [cfgState, cfgAction, cfgPending] = useActionState<BotFormState, FormData>(saveBotConfigAction, {});
  const [tokState, tokAction, tokPending] = useActionState<BotFormState, FormData>(rotateTokenAction, {});

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/bot/status", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: View) => { if (alive) { setV(d); setStale(false); } })
        .catch(() => alive && setStale(true));
    const id = setInterval(load, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const running = v.state === "RUNNING";
  const real = v.accountMode === "REAL";
  const c = v.config;
  const exposure = c.lots * c.maxPositions * 100;

  return (
    <div className="space-y-4">
      {real && (
        <div role="alert" className="card border border-red-500/70 text-red-300">
          <strong>ЖИНХЭНЭ ДАНС холбогдсон байна.</strong> Бот энэ дансан дээр жинхэнэ мөнгөөр арилжаа хийнэ{c.allowReal ? "" : " — гэхдээ “Жинхэнэ данс” сонголт унтраалттай тул Start дарсан ч ажиллахгүй"}.
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-2 text-lg font-semibold ${running ? "text-emerald-400" : "text-zinc-300"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${running ? "bg-emerald-400" : "bg-zinc-500"}`} />
            {running ? "Бот ажиллаж байна" : "Бот зогссон"}
          </span>
          {!running && v.stopReason && <span className="text-sm text-zinc-400">({STOP_REASON[v.stopReason] ?? v.stopReason})</span>}
          <span className={`ml-auto text-xs ${v.online ? "text-emerald-400" : "text-amber-400"}`}>
            MT5: {v.online ? "холбогдсон" : v.lastSeenAt ? "холболт тасарсан" : "холбогдоогүй"}{stale ? " · самбар шинэчлэгдэхгүй байна" : ""}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ["Данс", v.accountMode ? `${v.accountMode === "REAL" ? "Жинхэнэ" : "Demo"} ${v.accountLogin ?? ""}` : "—", real ? "text-red-300" : undefined],
            ["Balance", money(v.balance)],
            ["Equity", money(v.equity)],
            ["Сүүлийн 24ц", money(v.pnl24h), tone(v.pnl24h)],
          ] as [string, string, string?][]).map(([k, val, cls]) => (
            <div key={k}><div className="text-xs text-zinc-400">{k}</div><div className={`font-mono font-semibold ${cls ?? ""}`}>{val}</div></div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={startBotAction}><button className="btn" disabled={running || !v.hasToken}>Start bot</button></form>
          <form action={stopBotAction}><button className="btn-ghost" disabled={!running}>Stop</button></form>
          <form action={closeAllAction}><button className="btn-ghost text-red-300" disabled={v.positions.length === 0}>Бүгдийг хаах</button></form>
          {v.closeAllPending && <span className="self-center text-xs text-amber-400">Арилжаануудыг хааж байна…</span>}
        </div>
        {!v.online && <p className="mt-3 text-xs text-amber-400">MT5 робот холбогдоогүй үед Start дарсан ч арилжаа хийгдэхгүй. Робот холбогдмогц тушаалыг авна.</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 text-sm font-medium text-zinc-400">Одоо</h2>
          <div className={`text-2xl font-semibold ${v.signal === "BUY" ? "text-emerald-400" : v.signal === "SELL" ? "text-red-400" : "text-zinc-300"}`}>
            {v.signal === "BUY" ? "BUY" : v.signal === "SELL" ? "SELL" : v.signal === "NONE" ? "Хүлээж байна" : "—"}
          </div>
          <p className="mt-1 text-sm text-zinc-300">{v.reason || "Роботоос мэдээлэл ирээгүй"}</p>
          <p className="mt-2 text-xs text-zinc-500">{v.symbol ?? "—"} · bid {v.bid ?? "—"} · ask {v.ask ?? "—"}</p>
          {running && <p className={`mt-2 font-mono ${tone(v.runPnl)}`}>Энэ удаагийн үр дүн: {money(v.runPnl)}</p>}
          {running && (
            <p className="mt-1 text-sm text-zinc-400">
              {v.plannedSeconds ? `Ботын тооцсон хугацаа: ${Math.round(v.plannedSeconds)} сек · өнгөрсөн ${Math.round(v.elapsedSeconds ?? 0)} сек` : "Эхний арилжаагаа хүлээж байна — хугацааг орсны дараа тооцно"}
            </p>
          )}
        </div>

        <form action={cfgAction} className="card space-y-3">
          <h2 className="text-sm font-medium text-zinc-400">Тохиргоо</h2>
          <div className="grid grid-cols-2 gap-3">
            {([
              ["lots", "Лот (арилжаа бүрт)", c.lots, "0.01"], ["maxPositions", "Зэрэг нээх арилжаа", c.maxPositions, "1"],
              ["slAtr", "Stop loss (ATR ×)", c.slAtr, "0.1"], ["tpAtr", "Take profit (ATR ×)", c.tpAtr, "0.1"],
              ["profitTarget", "Ашиг $… хүрвэл зогс", c.profitTarget ?? "", "1"], ["maxLoss", "Алдагдал $… хүрвэл зогс", c.maxLoss ?? "", "1"],
            ] as [string, string, number | string, string][]).map(([name, label, val, step]) => (
              <div key={name}>
                <label className="label" htmlFor={name}>{label}</label>
                <input className="input" id={name} name={name} type="number" step={step} min="0" defaultValue={val} disabled={running} />
              </div>
            ))}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="allowReal" defaultChecked={c.allowReal} disabled={running} className="mt-1" />
            <span>Жинхэнэ данс дээр арилжаа хийхийг зөвшөөрөх <span className="block text-xs text-zinc-500">Унтраалттай үед бот зөвхөн demo данс дээр ажиллана. MT5 роботын тохиргоонд ч мөн адил сонголтыг асаах ёстой.</span></span>
          </label>
          <p className="text-xs text-zinc-400">Энэ тохиргоогоор хамгийн ихдээ {(c.lots * c.maxPositions).toFixed(2)} лот нээгдэнэ: алт $1 хөдлөхөд ±{money(exposure)}, $10 хөдлөхөд ±{money(exposure * 10)}. Хоосон орхисон зогсох нөхцөл үйлчлэхгүй. Хэр удаан ажиллахаа бот өөрөө тооцно.</p>
          {cfgState.error && <p role="alert" className="text-sm text-red-400">{cfgState.error}</p>}
          {cfgState.ok && <p role="status" className="text-sm text-emerald-400">{cfgState.ok}</p>}
          <button className="btn" disabled={running || cfgPending}>{running ? "Ажиллаж байх үед өөрчлөхгүй" : "Хадгалах"}</button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card overflow-x-auto">
          <h2 className="mb-2 text-sm font-medium text-zinc-400">Нээлттэй арилжаа ({v.positions.length})</h2>
          {v.positions.length === 0 ? <p className="text-sm text-zinc-500">Алга</p> : (
            <table className="w-full">
              <thead><tr>{["", "Лот", "Орсон", "SL", "TP", "P&L"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>{v.positions.map((p) => (
                <tr key={p.ticket} className="border-t border-zinc-800">
                  <td className={`td ${p.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{p.side}</td>
                  <td className="td font-mono">{p.lots}</td><td className="td font-mono">{p.openPrice}</td>
                  <td className="td font-mono">{p.sl || "—"}</td><td className="td font-mono">{p.tp || "—"}</td>
                  <td className={`td font-mono ${tone(p.profit)}`}>{money(p.profit)}</td>
                </tr>))}</tbody>
            </table>
          )}
        </div>
        <div className="card overflow-x-auto">
          <h2 className="mb-2 text-sm font-medium text-zinc-400">Арилжааны түүх (сүүлийн 50 · нийт {v.dealCount})</h2>
          {v.deals.length === 0 ? <p className="text-sm text-zinc-500">Хаагдсан арилжаа алга</p> : (
            <table className="w-full">
              <thead><tr>{["Хаагдсан (УБ)", "", "Лот", "Орсон", "Гарсан", "P&L"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>{v.deals.map((d) => (
                <tr key={d.ticket} className="border-t border-zinc-800">
                  <td className="td whitespace-nowrap font-mono">{ubTime(d.closeTime)}</td>
                  <td className={`td ${d.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{d.side}</td>
                  <td className="td font-mono">{d.lots}</td><td className="td font-mono">{d.openPrice}</td><td className="td font-mono">{d.closePrice}</td>
                  <td className={`td font-mono ${tone(d.profit)}`}>{money(d.profit)}</td>
                </tr>))}</tbody>
            </table>
          )}
        </div>
      </div>

      <form action={tokAction} className="card space-y-2">
        <h2 className="text-sm font-medium text-zinc-400">MT5 роботыг холбох</h2>
        <p className="text-sm text-zinc-300">Роботын тохиргоонд энэ хаягийг оруулна: <code className="rounded bg-zinc-800 px-1.5 py-0.5">{syncUrl}</code></p>
        {tokState.token ? (
          <p className="text-sm">Шинэ токен (дахин харагдахгүй, одоо хуулж ав): <code className="break-all rounded bg-zinc-800 px-1.5 py-0.5 text-amber-300">{tokState.token}</code></p>
        ) : (
          <p className="text-sm text-zinc-400">{v.hasToken ? "Токен үүссэн. Шинийг үүсгэвэл хуучин нь хүчингүй болж, роботод шинийг оруулах хэрэгтэй." : "Токен үүсээгүй. Эхлээд токен үүсгэнэ."}</p>
        )}
        <button className="btn-ghost" disabled={tokPending || running}>{v.hasToken ? "Шинэ токен үүсгэх" : "Токен үүсгэх"}</button>
      </form>
    </div>
  );
}
