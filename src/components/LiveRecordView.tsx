import type { PublicRecord } from "@/lib/publicRecord";
import type { Viewer } from "@/lib/viewer";
import { Dir, Figures, Pnl, SidePill, Station } from "./Timetable";

/** Fewer closed trades than this and the figures are labelled an early sample. */
export const EARLY_SAMPLE = 20;
const W = 600, H = 140;

const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`;
const money = (v: number) => `$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The closed balance day by day, as one gold line over the starting balance (dashed). Same drawing as the backtest curve. */
function RecordCurve({ r, v }: { r: PublicRecord; v: Viewer }) {
  const { t } = v;
  const values = [r.startBalance, ...r.series.map((p) => p.balance)];
  const lo = Math.min(...values), hi = Math.max(...values);
  const pad = (hi - lo || r.startBalance * 0.01 || 1) * 0.15;
  const floor = lo - pad, top = hi + pad;
  const x = (i: number) => (i / Math.max(values.length - 1, 1)) * W;
  const y = (val: number) => H - ((val - floor) / (top - floor)) * H;
  const line = values.map((val, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(val).toFixed(1)}`).join(" ");
  const last = values.at(-1)!;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-36 w-full sm:h-40" role="img"
        aria-label={t(`Хаагдсан balance-ийн муруй: ${money(r.startBalance)}-оос ${money(last)}, хамгийн их уналт −${r.maxDrawdownPct.toFixed(2)}%.`, `Closed balance curve: ${money(r.startBalance)} to ${money(last)}, largest fall −${r.maxDrawdownPct.toFixed(2)}%.`)}>
        <defs>
          <linearGradient id="live-record-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-amber-400)" stopOpacity="0.26" />
            <stop offset="1" stopColor="var(--color-amber-400)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={y(r.startBalance)} y2={y(r.startBalance)} stroke="var(--color-zinc-600)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="url(#live-record-fill)" />
        <path d={line} fill="none" stroke="var(--color-amber-300)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-zinc-500 tabular-nums">
        <span>{r.sinceDay}</span>
        <span>{r.series.at(-1)?.day ?? r.sinceDay}</span>
      </figcaption>
    </figure>
  );
}

/**
 * The public live record of the owner's own robot account: a calm placeholder until the first closed trade,
 * then the closed-balance curve, the figures and the last trades. Rendered on the server and, refreshed, in the browser.
 */
export function LiveRecordView({ record, v }: { record: PublicRecord | null; v: Viewer }) {
  const { t } = v;
  const badge = record && (
    <span data-testid="record-mode" className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${record.mode === "REAL" ? "bg-amber-400/15 text-amber-300" : "bg-white/[0.06] text-zinc-300"}`}>
      {record.mode === "REAL" ? t("Real данс", "Real account") : t("Demo данс", "Demo account")}
    </span>
  );
  const updated = record && <span className="text-xs text-zinc-500 tabular-nums">{t("Шинэчлэгдсэн:", "Updated:")} {v.dateTime(new Date(record.updatedAt))} {v.zone}</span>;

  if (!record || record.trades < 1) {
    return (
      <div data-testid="live-record-placeholder" className="flex items-start gap-3.5">
        <Station tone="now" className="mt-1.5 shrink-0" />
        <div className="min-w-0 space-y-2">
          <p className="text-zinc-100">
            {record
              ? t(`Live үр дүн ${record.sinceDay}-нээс бүртгэгдэж эхэлсэн — эхний арилжаа гармагц энд гарна.`, `The live record started on ${record.sinceDay} — it appears here as soon as the first trade closes.`)
              : t("Live үр дүн удахгүй бүртгэгдэж эхэлнэ — эхний арилжаа гармагц энд гарна.", "The live record starts soon — it appears here as soon as the first trade closes.")}
          </p>
          {record && <p className="flex flex-wrap items-center gap-2">{badge}{updated}</p>}
        </div>
      </div>
    );
  }

  const r = record;
  const early = r.trades < EARLY_SAMPLE;
  return (
    <div data-testid="live-record" className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.14em] text-amber-400 uppercase"><span className="now-pulse h-2 w-2 rounded-full bg-amber-400" />Live</span>
        {badge}
        <span className="ml-auto">{updated}</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <p className="min-w-0">
          <span className="mb-1.5 block text-sm text-zinc-400">{t(`${r.sinceDay}-нээс хойш, ${money(r.startBalance)}-ын данс дээр`, `Since ${r.sinceDay}, on a ${money(r.startBalance)} account`)}</span>
          <span data-testid="record-return" className={`font-display block text-[40px] leading-none tabular-nums sm:text-[52px] ${r.returnPct > 0 ? "text-emerald-400" : r.returnPct < 0 ? "text-red-400" : "text-zinc-50"}`}>
            {r.returnPct !== 0 && <Dir d={r.returnPct} className="mr-2 align-middle text-[0.5em]" />}{signedPct(r.returnPct)}
          </span>
        </p>
        <p className="text-right"><span className="block text-sm text-zinc-400">{t("Нийт ашиг", "Total profit")}</span><Pnl value={r.profit} className="text-2xl" /></p>
      </div>

      <RecordCurve r={r} v={v} />

      <Figures
        className="grid-cols-2 sm:grid-cols-5"
        label={t("Live үр дүнгийн тоонууд", "Live record figures")}
        items={[
          { label: t("Ажилласан хоног", "Days running"), value: r.daysRunning },
          { label: t("Арилжаа", "Trades"), value: r.trades },
          { label: "Win rate", value: `${r.winRate.toFixed(1)}%`, note: t(`${r.wins} ашигтай`, `${r.wins} won`) },
          { label: t("Өгөөж", "Return"), value: signedPct(r.returnPct), tone: r.returnPct > 0 ? "text-emerald-400" : r.returnPct < 0 ? "text-red-400" : undefined },
          { label: "Max drawdown", value: `−${r.maxDrawdownPct.toFixed(2)}%`, tone: r.maxDrawdownPct > 0 ? "text-red-300" : undefined },
        ]}
      />
      {early && <p className="text-sm text-amber-300">{t(`Эхний ${r.trades} арилжаа: дүгнэлт хийхэд хэтэрхий эрт.`, `The first ${r.trades} trade${r.trades === 1 ? "" : "s"}: too early to judge.`)}</p>}

      <div className="table-card">
        <h3 className="px-4 pt-4 pb-2 text-[15px] font-semibold text-zinc-100 sm:px-5">{t("Сүүлийн хаагдсан арилжаанууд", "Last closed trades")}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">{t("Хаагдсан", "Closed")}</th>
                <th className="th">{t("Тал", "Side")}</th>
                <th className="th text-right">Lot</th>
                <th className="th text-right">{t("Орсон → гарсан", "Entry → exit")}</th>
                <th className="th text-right">{t("Ашиг", "Profit")}</th>
              </tr>
            </thead>
            <tbody>
              {r.lastTrades.map((d, i) => (
                <tr key={`${d.time}-${i}`} data-result={d.profit > 0 ? "win" : d.profit < 0 ? "loss" : "flat"}>
                  <td className="td whitespace-nowrap text-zinc-400 tabular-nums">{v.dateTime(new Date(d.time))}</td>
                  <td className="td"><SidePill side={d.side} /></td>
                  <td className="td text-right tabular-nums">{d.lots}</td>
                  <td className="td text-right whitespace-nowrap tabular-nums">{d.entry.toFixed(2)} → {d.exit.toFixed(2)}</td>
                  <td className="td text-right"><Pnl value={d.profit} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-sm text-zinc-500">{t("Эзэмшигчийн өөрийн MT5 данс дээрх XauBot-ын хаагдсан арилжаа, robot-ын тайлангаас автоматаар. Өнгөрсөн үр дүн ирээдүйн ашгийг баталгаажуулахгүй.", "Closed XauBot trades on the owner's own MT5 account, taken automatically from the robot's reports. Past results do not guarantee future profit.")}</p>
    </div>
  );
}
