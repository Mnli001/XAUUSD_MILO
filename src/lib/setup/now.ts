import type { SetupNow } from "./setups";
import type { Viewer } from "../viewer";
import { relativeText } from "../relativeTime";

/**
 * The one line a trader needs: what the system is doing right now (waiting, enter, in a trade, done, nothing
 * today), what exactly it waits for, and when the next step comes. Built from the Asian rule's reading.
 */
export type NowState = "WAIT" | "ENTER" | "DONE" | "NONE" | "CLOSED";
export type NowWindow = { state: NowState; title: string; waitingFor: string | null; next: { label: string; at: Date; in: string } | null; liveR: number | null };

const H = 36e5;
const utcAt = (now: Date, h: number, dayShift = 0) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayShift, h));
/** The next weekday 00:00 UTC (the Asian range starts), skipping the weekend. */
function nextRangeStart(now: Date): Date {
  let d = utcAt(now, 0, 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 24 * H);
  return d;
}

export function nowWindow(s: SetupNow, now: Date, lastPrice: number | null, v: Viewer): NowWindow {
  const { t, ub, zone } = v;
  const h = now.getUTCHours();
  const mk = (label: string, at: Date) => ({ label, at, in: relativeText(at.getTime() - now.getTime(), t) });
  const firstMissing = s.checks.find((c) => !c.ok)?.label ?? null;
  if (s.stale) return { state: "NONE", title: t("Үнийн дата хоцорч байна", "Price data is behind"), waitingFor: t("Шинэ үнэ ирэхийг", "Fresh prices"), next: null, liveR: null };
  if (s.status === "ACTIVE" && s.side && s.entry !== null && s.stop !== null) {
    const dir = s.side === "BUY" ? 1 : -1, risk = Math.abs(s.entry - s.stop);
    const liveR = lastPrice !== null && risk > 0 ? Math.round(((dir * (lastPrice - s.entry)) / risk) * 100) / 100 : null;
    return { state: "ENTER", title: t(`${s.side} арилжаа идэвхтэй`, `${s.side} trade is on`), waitingFor: t("Stop эсвэл target-д хүрэхийг", "The stop or the target"), next: mk(t(`Хаах цаг (${ub("04:00")} ${zone})`, `Closing time (${ub("04:00")} ${zone})`), utcAt(now, 20)), liveR };
  }
  if (s.result !== undefined) return { state: "DONE", title: t(`Өнөөдрийн арилжаа дууссан (${s.result > 0 ? "+" : ""}${s.result.toFixed(2)}R)`, `Today's trade is done (${s.result > 0 ? "+" : ""}${s.result.toFixed(2)}R)`), waitingFor: null, next: mk(t(`Маргаашийн Азийн хүрээ (${ub("08:00")} ${zone})`, `Tomorrow's Asian range (${ub("08:00")} ${zone})`), nextRangeStart(now)), liveR: null };
  if (s.status === "FORMING") return { state: "WAIT", title: t("Азийн хүрээ бүрдэж байна", "The Asian range is forming"), waitingFor: t(`Хүрээ ${ub("15:00")} (${zone}) цагт хаагдахыг`, `The range to close at ${ub("15:00")} (${zone})`), next: mk(t(`Орох цонх нээгдэнэ (${ub("15:00")} ${zone})`, `Entry window opens (${ub("15:00")} ${zone})`), utcAt(now, 7)), liveR: null };
  if (s.status === "WATCH") return { state: "WAIT", title: s.headline, waitingFor: firstMissing ?? s.headline, next: mk(t(`Орох цонх хаагдана (${ub("00:00")} ${zone})`, `Entry window closes (${ub("00:00")} ${zone})`), utcAt(now, 16)), liveR: null };
  const closed = now.getUTCDay() === 0 || now.getUTCDay() === 6;
  return {
    state: closed ? "CLOSED" : "NONE",
    title: s.headline,
    waitingFor: h < 16 && firstMissing ? firstMissing : null,
    next: mk(t(`Дараагийн Азийн хүрээ (${ub("08:00")} ${zone})`, `Next Asian range (${ub("08:00")} ${zone})`), nextRangeStart(now)),
    liveR: null,
  };
}
