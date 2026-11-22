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
  REAL_NOT_ALLOWED: "жинхэнэ данс зөвшөөрөгдөөгүй", NO_ACCESS: "хандах эрх дууссан",
  OLD_ROBOT: "MT5 дээрх роботын файл хуучин, Багц хэрэгслийг мэдэхгүй",
};
const TOOLS = [
  ["SCALPER", "Scalper", "Нэг нэгээр орно. Арилжаа бүр өөрийн stop, target-тай. Хэр удаан ажиллахаа бот өөрөө тооцно."],
  ["BASKET", "Багц", "Дохио гармагц олон арилжааг зэрэг нээнэ. Нийт ашиг таны тавьсан дүнд хүрмэгц бүгдийг зэрэг хаана."],
] as const;
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
  const [tool, setTool] = useState(c.mode);
  const basket = tool === "BASKET";
  const exposure = (basket ? c.basket.lots * c.basket.count : c.lots * c.maxPositions) * 100; // $ per $1 move in gold
  const spread = v.bid !== null && v.ask !== null && v.ask > v.bid ? v.ask - v.bid : null;
  const oldRobot = v.robotVersion === null ? v.online : v.robotVersion < 2;
  const savedTool = TOOLS.find(([id]) => id === c.mode)![1];

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
          <span className="rounded-md border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{savedTool}</span>
          {!running && v.stopReason && <span className="text-sm text-zinc-400">({STOP_REASON[v.stopReason] ?? v.stopReason})</span>}
          <span className={`ml-auto text-xs ${v.online ? "text-emerald-400" : "text-amber-400"}`}>
            MT5: {v.online ? "холбогдсон" : v.lastSeenAt ? "холболт тасарсан" : "холбогдоогүй"}{stale ? " · самбар шинэчлэгдэхгүй байна" : ""}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {([
            ["Данс", v.accountMode ? `${v.accountMode === "REAL" ? "Жинхэнэ" : "Demo"} ${v.accountLogin ?? ""}` : "—", real ? "text-red-300" : undefined],
            ["Balance", money(v.balance)],
            ["Equity", money(v.equity)],
            ["Сүүлийн 24ц", money(v.pnl24h), tone(v.pnl24h)],
          ] as [string, string, string?][]).map(([k, val, cls]) => (
            <div key={k} className="min-w-0"><div className="text-xs text-zinc-400">{k}</div><div className={`truncate font-mono font-semibold sm:text-lg ${cls ?? ""}`}>{val}</div></div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <form action={startBotAction} className="max-sm:flex-1"><button className="btn w-full px-6" disabled={running || !v.hasToken}>Start bot</button></form>
          <form action={stopBotAction} className="max-sm:flex-1"><button className="btn-ghost w-full px-6" disabled={!running}>Stop</button></form>
          <form action={closeAllAction} className="max-sm:w-full"><button className="btn-ghost w-full text-red-300" disabled={v.positions.length === 0}>Бүгдийг хаах</button></form>
          {v.closeAllPending && <span className="self-center text-xs text-amber-400">Арилжаануудыг хааж байна…</span>}
        </div>
        {!v.online && <p className="mt-3 text-xs text-amber-400">MT5 робот холбогдоогүй үед Start дарсан ч арилжаа хийгдэхгүй. Робот холбогдмогц тушаалыг авна.</p>}
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="card-title">Одоо</h2>
          <div className={`text-3xl font-semibold tracking-tight ${v.signal === "BUY" ? "text-emerald-400" : v.signal === "SELL" ? "text-red-400" : "text-zinc-300"}`}>
            {v.signal === "BUY" ? "BUY" : v.signal === "SELL" ? "SELL" : v.signal === "NONE" ? "Хүлээж байна" : "—"}
          </div>
          <p className="mt-1 text-sm text-zinc-300">{v.reason || "Роботоос мэдээлэл ирээгүй"}</p>
          <p className="mt-2 font-mono text-xs text-zinc-500">{v.symbol ?? "—"}, bid {v.bid ?? "—"}, ask {v.ask ?? "—"}</p>
          {running && <p className={`mt-2 font-mono ${tone(v.runPnl)}`}>Энэ удаагийн үр дүн: {money(v.runPnl)}</p>}
          {running && c.mode === "BASKET" && (
            <p className="mt-1 text-sm text-zinc-400">
              {v.positions.length > 0 ? `Багц нээлттэй. ${money(c.basket.profit)} ашигт хүрвэл эсвэл ${money(-c.basket.loss)} алдагдалд хүрвэл бүгдийг зэрэг хаана.` : "Дохио хүлээж байна. Гармагц багцыг бүхэлд нь нээнэ."}
            </p>
          )}
          {running && c.mode !== "BASKET" && (
            <p className="mt-1 text-sm text-zinc-400">
              {v.plannedSeconds ? `Ботын тооцсон хугацаа: ${Math.round(v.plannedSeconds)} сек · өнгөрсөн ${Math.round(v.elapsedSeconds ?? 0)} сек` : "Эхний арилжаагаа хүлээж байна — хугацааг орсны дараа тооцно"}
            </p>
          )}
        </div>

        <form action={cfgAction} className="card space-y-3">
          <h2 className="text-sm font-medium text-zinc-400">Хэрэгсэл ба тохиргоо</h2>
          <input type="hidden" name="mode" value={tool} />
          <div role="radiogroup" aria-label="Ботын хэрэгсэл" className="grid grid-cols-2 gap-2">
            {TOOLS.map(([id, name, about]) => (
              <button key={id} type="button" role="radio" aria-checked={tool === id} disabled={running} onClick={() => setTool(id)}
                className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${tool === id ? "border-amber-400 bg-amber-400/10" : "border-zinc-700 hover:bg-zinc-800"}`}>
                <span className={`block font-semibold ${tool === id ? "text-amber-300" : "text-zinc-100"}`}>{name}</span>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-400">{about}</span>
              </button>
            ))}
          </div>
          {basket && oldRobot && (
            <p role="alert" className="rounded-lg border border-amber-400/50 px-3 py-2 text-xs leading-relaxed text-amber-200">
              MT5 дээрх роботын файл хуучин тул Багц ажиллахгүй. <a className="underline" href="/api/bot/download?file=ex5">Шинэ XauBot.ex5</a>-ийг татаж Experts хавтсанд хуучныг нь дарж хуулаад MT5-аа дахин нээнэ үү.
            </p>
          )}
          <div className="grid grid-cols-2 items-end gap-3" key={tool}>
            {((basket ? [
              ["bLots", "Лот (арилжаа бүрт)", c.basket.lots, "0.01"], ["bCount", "Арилжааны тоо (зэрэг)", c.basket.count, "1"],
              ["bProfit", "Ашиг $… болмогц хаах", c.basket.profit, "0.5"], ["bLoss", "Алдагдал $… болвол хаах", c.basket.loss, "0.5"],
            ] : [
              ["lots", "Лот (арилжаа бүрт)", c.lots, "0.01"], ["maxPositions", "Зэрэг нээх арилжаа", c.maxPositions, "1"],
              ["slAtr", "Stop loss (ATR ×)", c.slAtr, "0.1"], ["tpAtr", "Take profit (ATR ×)", c.tpAtr, "0.1"],
              ["profitTarget", "Ашиг $… хүрвэл зогс", c.profitTarget ?? "", "1"], ["maxLoss", "Алдагдал $… хүрвэл зогс", c.maxLoss ?? "", "1"],
            ]) as [string, string, number | string, string][]).map(([name, label, val, step]) => (
              <div key={name}>
                <label className="label" htmlFor={name}>{label}</label>
                <input className="input" id={name} name={name} type="number" inputMode="decimal" step={step} min="0" defaultValue={val} disabled={running} />
              </div>
            ))}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="allowReal" defaultChecked={c.allowReal} disabled={running} className="mt-0.5 h-5 w-5 shrink-0 accent-amber-500" />
            <span>Жинхэнэ данс дээр арилжаа хийхийг зөвшөөрөх <span className="block text-xs text-zinc-500">Унтраалттай үед бот зөвхөн demo данс дээр ажиллана. MT5 роботын тохиргоонд ч мөн адил сонголтыг асаах ёстой.</span></span>
          </label>
          {basket ? (
            <p className="text-xs leading-relaxed text-zinc-400">
              Хадгалсан тохиргоогоор {c.basket.count} арилжаа, нийт {(c.basket.lots * c.basket.count).toFixed(2)} лот зэрэг нээгдэнэ: алт $1 хөдлөхөд ±{money(exposure)}.
              {" "}Ашигт хүрэхийн тулд алт ойролцоогоор ${(c.basket.profit / exposure + (spread ?? 0)).toFixed(2)} таатай тийш, алдагдлын хязгаарт хүрэхэд ${Math.max(c.basket.loss / exposure - (spread ?? 0), 0).toFixed(2)} эсрэг тийш хөдөлнө
              {spread !== null ? ` (одоогийн spread $${spread.toFixed(2)} орсон; багц нээгдэх мөчид ${money(-spread * exposure)}-оос эхэлнэ).` : " (spread орохгүйгээр)."}
              {" "}Хугацааны хязгаар байхгүй: аль нэг дүнд хүртэл нээлттэй байна. Арилжаа бүрт алдагдлын хязгаараас 2 дахин хол аваарын stop тавигдана (компьютер унтарсан үед).
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-zinc-400">Хадгалсан тохиргоогоор хамгийн ихдээ {(c.lots * c.maxPositions).toFixed(2)} лот нээгдэнэ: алт $1 хөдлөхөд ±{money(exposure)}, $10 хөдлөхөд ±{money(exposure * 10)}. Хоосон орхисон зогсох нөхцөл үйлчлэхгүй. Хэр удаан ажиллахаа бот өөрөө тооцно.</p>
          )}
          {cfgState.error && <p role="alert" className="text-sm text-red-400">{cfgState.error}</p>}
          {cfgState.ok && <p role="status" className="text-sm text-emerald-400">{cfgState.ok}</p>}
          <button className="btn" disabled={running || cfgPending}>{running ? "Ажиллаж байх үед өөрчлөхгүй" : "Хадгалах"}</button>
        </form>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="table-card">
          <h2 className="px-4 pt-4 text-sm font-medium text-zinc-400 sm:px-5 sm:pt-5">Нээлттэй арилжаа ({v.positions.length})</h2>
          {v.positions.length === 0 ? <p className="px-4 py-3 text-sm text-zinc-500 sm:px-5">Алга</p> : (
            <table className="w-full">
              <thead><tr>{["", "Лот", "Орсон", "SL", "TP", "P&L"].map((h) => <th key={h} className={`th ${h === "SL" || h === "TP" ? "hidden sm:table-cell" : ""} ${h === "P&L" ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody>{v.positions.map((p) => (
                <tr key={p.ticket} className="border-t border-zinc-800">
                  <td className={`td ${p.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{p.side}</td>
                  <td className="td font-mono">{p.lots}</td><td className="td font-mono">{p.openPrice}</td>
                  <td className="td hidden font-mono sm:table-cell">{p.sl || "—"}</td><td className="td hidden font-mono sm:table-cell">{p.tp || "—"}</td>
                  <td className={`td text-right font-mono ${tone(p.profit)}`}>{money(p.profit)}</td>
                </tr>))}</tbody>
            </table>
          )}
        </div>
        <div className="table-card">
          <h2 className="px-4 pt-4 text-sm font-medium text-zinc-400 sm:px-5 sm:pt-5">Арилжааны түүх <span className="text-zinc-500">(сүүлийн 50, нийт {v.dealCount})</span></h2>
          {v.deals.length === 0 ? <p className="px-4 py-3 text-sm text-zinc-500 sm:px-5">Хаагдсан арилжаа алга</p> : (
            <table className="w-full">
              <thead><tr>{["Хаагдсан (УБ)", "", "Лот", "Орсон", "Гарсан", "P&L"].map((h) => <th key={h} className={`th ${h === "Орсон" || h === "Гарсан" ? "hidden sm:table-cell" : ""} ${h === "P&L" ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody>{v.deals.map((d) => (
                <tr key={d.ticket} className="border-t border-zinc-800">
                  <td className="td whitespace-nowrap font-mono">{ubTime(d.closeTime)}</td>
                  <td className={`td ${d.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{d.side}</td>
                  <td className="td font-mono">{d.lots}</td><td className="td hidden font-mono sm:table-cell">{d.openPrice}</td><td className="td hidden font-mono sm:table-cell">{d.closePrice}</td>
                  <td className={`td text-right font-mono ${tone(d.profit)}`}>{money(d.profit)}</td>
                </tr>))}</tbody>
            </table>
          )}
        </div>
      </div>

      <form action={tokAction} className="card space-y-2">
        <h2 className="text-sm font-medium text-zinc-400">MT5 роботыг холбох</h2>
        <p className="text-sm text-zinc-300">Роботын тохиргоонд энэ хаягийг оруулна:</p>
        <code className="block rounded-lg bg-zinc-950 px-3 py-2 text-sm break-all text-zinc-200">{syncUrl}</code>
        {tokState.token ? (
          <p className="text-sm">Шинэ токен (дахин харагдахгүй, одоо хуулж ав): <code className="mt-1 block rounded-lg bg-zinc-950 px-3 py-2 break-all text-amber-300 select-all">{tokState.token}</code></p>
        ) : (
          <p className="text-sm text-zinc-400">{v.hasToken ? "Токен үүссэн. Шинийг үүсгэвэл хуучин нь хүчингүй болж, роботод шинийг оруулах хэрэгтэй." : "Токен үүсээгүй. Эхлээд токен үүсгэнэ."}</p>
        )}
        <button className="btn-ghost" disabled={tokPending || running}>{v.hasToken ? "Шинэ токен үүсгэх" : "Токен үүсгэх"}</button>
      </form>
    </div>
  );
}
