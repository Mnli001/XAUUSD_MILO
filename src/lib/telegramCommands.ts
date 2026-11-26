import { getSetups } from "./setup/build";
import { signalHistory } from "./signalHistory";
import { outcomeTotals } from "./signalOutcome";
import { getEvents } from "./events";
import { eventTitle } from "./data/calendarProvider";
import { tradeChartPng } from "./tradeChart";
import { relativeText } from "./relativeTime";
import { weekdayName, zoneWeekday } from "./time";
import type { Viewer } from "./viewer";

/**
 * Replies to /setup, /history and /news. Kept apart from telegram.ts so the webhook loads the
 * setup and history code only when someone asks.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const px = (v: number) => v.toFixed(2);

/** The setup as it stands: status, what it waits for, the levels and every check; with a picture when there are levels. */
export async function setupReply(now: Date, v: Viewer): Promise<{ text: string; png: Buffer | null }> {
  const { t } = v;
  const view = await getSetups(now, v);
  const s = view.setups[0];
  if (!s) return { text: esc(t("Setup одоогоор алга.", "No setup right now.")), png: null };
  const word = s.result !== undefined ? t("Дууссан", "Finished") : { ACTIVE: t("Идэвхтэй", "Active"), WATCH: t("Ажиглаж байна", "Watching"), FORMING: t("Бүрдэж байна", "Forming"), OFF: t("Одоо алга", "Not now") }[s.status];
  const lines = [
    `<b>${esc(s.name)}</b> · ${esc(word)}`,
    `<b>${esc(s.headline)}</b>`,
    esc(s.detail),
  ];
  if (s.entry !== null && s.stop !== null && s.target !== null) {
    lines.push("", t(`Орох ${px(s.entry)} · Stop ${px(s.stop)} · Target ${px(s.target)}`, `Entry ${px(s.entry)} · Stop ${px(s.stop)} · Target ${px(s.target)}`));
  }
  if (s.checks.length) lines.push("", ...s.checks.map((c) => `${c.ok ? "✅" : "⬜"} ${esc(c.label)}`));
  const h = s.history;
  if (h.winPct !== null) lines.push("", t(`Түүх: ${h.n} арилжаа, ${h.winPct}% ашигтай, дундаж ${h.avgR! > 0 ? "+" : ""}${h.avgR!.toFixed(2)}R`, `Record: ${h.n} trades, ${h.winPct}% profitable, average ${h.avgR! > 0 ? "+" : ""}${h.avgR!.toFixed(2)}R`));
  let png: Buffer | null = null;
  if (s.side && s.entry !== null && s.stop !== null && s.target !== null && view.candles.length > 10) {
    png = await tradeChartPng({
      bars: view.candles, side: s.side, entry: s.entry, stop: s.stop, target: s.target,
      openedAt: s.at ?? new Date(view.candles.at(-1)!.time.getTime() + 15 * 6e4), exit: null,
      title: `${s.side} XAUUSD · ${word}`, subtitle: s.name, badge: null, clock: v.time,
    });
  }
  return { text: lines.join("\n"), png };
}

/** The last ten signals with how each ended, and the totals. */
export async function historyReply(now: Date, v: Viewer): Promise<string> {
  const { t } = v;
  const rows = await signalHistory(now, 10);
  if (rows.length === 0) return esc(t("Одоогоор дохио гараагүй.", "No signals yet."));
  const tot = outcomeTotals(rows.map((r) => r.outcome));
  const mark = (k: string, r: number | null) => (k === "WIN" ? "✅" : k === "LOSS" ? "❌" : k === "TIME" ? ((r ?? 0) > 0 ? "🟢" : "⚪") : "⏳");
  const lines = [
    t("<b>Сүүлийн дохионууд</b>", "<b>Recent signals</b>"),
    t(`Ашигтай ${tot.wins} · алдагдалтай ${tot.losses}${tot.open ? ` · нээлттэй ${tot.open}` : ""} · нийт <b>${tot.totalR > 0 ? "+" : ""}${tot.totalR.toFixed(2)}R</b>${tot.winPct !== null ? ` · ${tot.winPct}%` : ""}`,
      `Won ${tot.wins} · lost ${tot.losses}${tot.open ? ` · open ${tot.open}` : ""} · total <b>${tot.totalR > 0 ? "+" : ""}${tot.totalR.toFixed(2)}R</b>${tot.winPct !== null ? ` · ${tot.winPct}%` : ""}`),
    "",
    ...rows.map((r) => {
      const res = r.outcome.r === null ? t("нээлттэй", "open") : `${r.outcome.r > 0 ? "+" : ""}${r.outcome.r.toFixed(2)}R`;
      return `${mark(r.outcome.kind, r.outcome.r)} ${v.dateTime(r.createdAt).slice(5)} · ${r.side} ${px(r.entry)} · <b>${res}</b>`;
    }),
  ];
  return lines.join("\n");
}

/** The important releases of the next three days, each with its full date, time and how long until it. */
export async function newsReply(now: Date, v: Viewer): Promise<string> {
  const { t } = v;
  const events = (await getEvents(new Date(now.getTime() - 30 * 6e4), new Date(now.getTime() + 3 * 864e5))).filter((e) => e.impact === "HIGH");
  if (events.length === 0) return esc(t("Дараагийн 3 хоногт чухал мэдээ алга.", "No important releases in the next 3 days."));
  return [
    t(`<b>Чухал мэдээ · дараагийн 3 хоног</b> (${esc(v.zone)})`, `<b>Important releases · next 3 days</b> (${esc(v.zone)})`),
    "",
    ...events.map((e) => `🔴 <b>${esc(weekdayName(zoneWeekday(e.time, v.timeZone), t))} ${v.dateTime(e.time).slice(5)}</b> · ${esc(eventTitle(e, t))} · <i>${esc(relativeText(e.time.getTime() - now.getTime(), t))}</i>`),
  ].join("\n");
}
