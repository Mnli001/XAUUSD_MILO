import type { T } from "./i18n";
import { zonedToUtc } from "./time";

/** Ounces in one lot of XAUUSD. */
export const OZ_PER_LOT = 100;

/** A trade written down by hand. Times are real instants; the page turns the reader's wall clock into them. */
export type ManualTrade = {
  side: "BUY" | "SELL"; lots: number; openPrice: number; closePrice: number; openTime: Date; closeTime: Date;
  stopLoss: number | null; note: string | null;
};

/** (exit − entry) × side × lots × 100 oz, to the cent. Swap and commission are not known for a written trade. */
export function manualProfit(t: Pick<ManualTrade, "side" | "lots" | "openPrice" | "closePrice">): number {
  const dir = t.side === "BUY" ? 1 : -1;
  return Math.round((t.closePrice - t.openPrice) * dir * t.lots * OZ_PER_LOT * 100) / 100;
}

/** A written trade's note is kept short; a journal line, not an essay. */
export const NOTE_MAX = 500;
/** How many trades one member may write down by hand. */
export const MANUAL_MAX = 3000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/\s/g, "").replace(",", ".");
  return s === "" ? null : Number(s);
};

/**
 * Reads the journal form: date, open and close time on the reader's clock (a close time earlier than the open time is
 * the next day), side, entry, exit, lots, an optional stop and note. Returns the trade, or the first thing wrong.
 */
export function parseManualTrade(form: FormData, timeZone: string, now: Date, t: T): { trade: ManualTrade } | { error: string } {
  const side = String(form.get("side") ?? "");
  if (side !== "BUY" && side !== "SELL") return { error: t("BUY эсвэл SELL сонгоно уу.", "Choose BUY or SELL.") };
  const date = String(form.get("date") ?? "").trim();
  const open = String(form.get("openAt") ?? "").trim();
  const close = String(form.get("closeAt") ?? "").trim() || open;
  if (!DATE.test(date) || !TIME.test(open) || !TIME.test(close)) return { error: t("Огноо, цагаа бүрэн оруулна уу.", "Enter the date and time.") };
  const openTime = zonedToUtc(date, open, timeZone);
  let closeTime = zonedToUtc(date, close, timeZone);
  if (closeTime < openTime) closeTime = new Date(closeTime.getTime() + 864e5);
  if (Number.isNaN(openTime.getTime())) return { error: t("Огноо буруу байна.", "That date is not valid.") };
  if (closeTime.getTime() > now.getTime() + 5 * 6e4) return { error: t("Хаасан цаг ирээдүйд байж болохгүй: хаагдсан арилжааг л бичнэ.", "The close cannot be in the future: only closed trades are written down.") };
  if (openTime.getFullYear() < 2000) return { error: t("Огноо буруу байна.", "That date is not valid.") };
  const openPrice = num(form.get("openPrice")), closePrice = num(form.get("closePrice")), lots = num(form.get("lots")), stop = num(form.get("stopLoss"));
  const price = (x: number | null) => x !== null && Number.isFinite(x) && x > 0 && x < 1e6;
  if (!price(openPrice) || !price(closePrice)) return { error: t("Орсон, гарсан үнээ зөв оруулна уу.", "Enter valid entry and exit prices.") };
  if (lots === null || !Number.isFinite(lots) || lots < 0.01 || lots > 100) return { error: t("Lot 0.01-ээс 100-ийн хооронд байна.", "Lots must be between 0.01 and 100.") };
  if (stop !== null && !price(stop)) return { error: t("Stop-ын үнэ буруу байна.", "The stop price is not valid.") };
  const note = String(form.get("note") ?? "").trim();
  if (note.length > NOTE_MAX) return { error: t(`Тэмдэглэл ${NOTE_MAX} тэмдэгтээс хэтрэхгүй.`, `The note is at most ${NOTE_MAX} characters.`) };
  return { trade: { side, lots: Math.round(lots * 100) / 100, openPrice: openPrice!, closePrice: closePrice!, openTime, closeTime, stopLoss: stop, note: note || null } };
}
