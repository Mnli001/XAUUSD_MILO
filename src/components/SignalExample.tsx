import type { Candle } from "@/lib/analysis/indicators";
import type { SignalRow } from "@/lib/signalHistory";
import type { Viewer } from "@/lib/viewer";
import { tradeChartSvg } from "@/lib/tradeChart";
import { stamp } from "@/lib/siteCopy";

const px = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The closed signal to show: the newest one with an exit, or null. */
export const exampleSignal = (rows: readonly SignalRow[]): SignalRow | null => rows.find((r) => r.outcome.kind !== "OPEN" && r.outcome.at && r.outcome.r !== null) ?? null;

/**
 * A real signal as Telegram showed it: the same picture the result message carries (tradeChartSvg), drawn from the
 * stored candles. Without a closed signal or its candles, a plain card shaped like the message, labelled as an example.
 */
export function SignalExample({ row, bars, v, now = new Date() }: { row: SignalRow | null; bars: readonly Candle[]; v: Viewer; now?: Date }) {
  const { t } = v;
  const o = row?.outcome;
  const covered = row && o?.at && bars.some((b) => b.time.getTime() <= row.createdAt.getTime()) && bars.some((b) => b.time.getTime() >= o.at!.getTime() - 15 * 6e4);
  if (row && o && o.at && o.r !== null && o.kind !== "OPEN" && covered) {
    const exitPrice = o.kind === "WIN" ? row.target : o.kind === "LOSS" ? row.stop : bars.filter((b) => b.time.getTime() < o.at!.getTime()).at(-1)?.close ?? row.entry;
    const svg = tradeChartSvg({
      bars, side: row.side === "SELL" ? "SELL" : "BUY", entry: row.entry, stop: row.stop, target: row.target, openedAt: row.createdAt,
      exit: { at: o.at, price: exitPrice, kind: o.kind },
      title: `${o.kind === "WIN" ? t("TP хүрлээ", "Target hit") : o.kind === "LOSS" ? t("SL хүрлээ", "Stop hit") : t("Цагаар хаагдлаа", "Closed on time")} · ${row.side} XAUUSD`,
      subtitle: `${row.name} · ${t("орсон", "entry")} ${px(row.entry)} · stop ${px(row.stop)} · target ${px(row.target)}`,
      badge: { text: `${o.r > 0 ? "+" : ""}${o.r.toFixed(2)}R`, kind: o.kind },
      clock: v.time,
    });
    return (
      <figure className="m-0">
        <div
          role="img"
          aria-label={t(`${row.side} XAUUSD дохионы зураг: орсон ${px(row.entry)}, stop ${px(row.stop)}, target ${px(row.target)}, үр дүн ${o.r.toFixed(2)}R`, `${row.side} XAUUSD signal picture: entry ${px(row.entry)}, stop ${px(row.stop)}, target ${px(row.target)}, result ${o.r.toFixed(2)}R`)}
          className="overflow-hidden rounded-[22px] border [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          style={{ borderColor: "var(--hairline)" }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <figcaption className="mt-3 text-sm text-zinc-500">
          {t(`Бодит дохио, ${stamp(v, row.createdAt, now)} (${v.zone}). Telegram-д яг ийм зураг ирдэг.`, `A real signal, ${stamp(v, row.createdAt, now)} (${v.zone}). Telegram receives exactly this picture.`)}
        </figcaption>
      </figure>
    );
  }
  return (
    <figure className="m-0">
      <div className="glass-inset space-y-3 p-5 text-sm">
        <p className="flex items-center justify-between gap-3">
          <span className="font-semibold text-zinc-50">BUY XAUUSD · {t("Азийн breakout", "Asian breakout")}</span>
          <span className="glass-pill text-amber-300">{t("шинэ дохио", "new signal")}</span>
        </p>
        <dl className="grid grid-cols-2 gap-2 tabular-nums sm:grid-cols-4">
          {[[t("Орох", "Entry"), "—"], ["Stop", "—"], ["Target", "—"], ["R:R", "1:3"]].map(([k, val]) => (
            <div key={k} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--hairline)" }}>
              <dt className="text-xs text-zinc-500">{k}</dt>
              <dd className="font-semibold text-zinc-100">{val}</dd>
            </div>
          ))}
        </dl>
      </div>
      <figcaption className="mt-3 text-sm text-zinc-500">{t("Жишээ: Telegram мессежийн бүтэц. Бодит дохионд үнэ, чарт хамт ирнэ.", "Example: the shape of the Telegram message. Real signals carry the prices and a chart.")}</figcaption>
    </figure>
  );
}
