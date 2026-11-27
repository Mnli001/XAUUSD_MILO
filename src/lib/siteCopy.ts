/**
 * Copy shared across pages that is computed rather than written once: the signal window, robot file
 * labels, the session rules' times on the viewer's clock, the broker research record and test windows.
 * Pure (no database), so client components may import it.
 */
import type { T } from "./i18n";
import type { Viewer } from "./viewer";
import { type SessionRule, hourUtc } from "./setup/sessionRules";

/** Every page that sums up signals counts the same window: the last this many. */
export const SIGNAL_WINDOW = 60;
export const signalWindowLabel = (t: T) => t(`Сүүлийн ${SIGNAL_WINDOW} дохио`, `Last ${SIGNAL_WINDOW} signals`);

/** The protocol number the robot reports (ROBOT_VERSION in XauBot.mq5), as the file version people see. */
const ROBOT_FILES: Record<number, string> = { 6: "2.80", 7: "2.90", 8: "3.00", 9: "3.10", 10: "3.30", 11: "3.40", 12: "3.50", 13: "3.60", 14: "3.70", 15: "3.81", 16: "3.91" };
/** "v3.60", or null for a protocol this table does not know yet (copy then says "the newest file"). */
export const robotFileLabel = (protocol: number): string | null => (ROBOT_FILES[protocol] ? `v${ROBOT_FILES[protocol]}` : null);

/** A date and time without the year when it is this year (in the viewer's clock), with it otherwise. */
export function stamp(v: Pick<Viewer, "dateTime">, d: Date, now: Date = new Date()): string {
  const full = v.dateTime(d);
  return full.slice(0, 4) === v.dateTime(now).slice(0, 4) ? full.slice(5) : full;
}

/** A UTC hour of the day (fractions allowed) as a fixed Ulaanbaatar clock text, then on the viewer's clock. */
const ubOf = (v: Pick<Viewer, "ub">, utcHour: number) => v.ub(hourUtc((utcHour + 8) % 24));

/** When a rule's trade is closed by time, said on the viewer's clock. */
export function exitText(rule: Pick<SessionRule, "exit">, v: Pick<Viewer, "t" | "ub">): string {
  const { t } = v;
  const fri = ubOf(v, 20);
  return rule.exit === "same20"
    ? t(`stop, target-д хүрээгүй бол ${fri}-д хаагдана`, `if neither the stop nor the target is hit, it closes at ${fri}`)
    : t(`stop, target-д хүрээгүй бол маргааш ${ubOf(v, 7)} хүртэл барина (баасан гарагт ${fri}-д хаагдана)`, `if neither is hit, it is held until ${ubOf(v, 7)} the next day (closed at ${fri} on a Friday)`);
}

/** One line per rule: its range, entry window, reward and time exit, from SESSION_RULES. */
export function ruleLine(rule: SessionRule, name: string, v: Pick<Viewer, "t" | "ub" | "zone">): string {
  const { t, zone } = v;
  return t(
    `${name}: хүрээ ${ubOf(v, rule.rangeFrom)}–${ubOf(v, rule.rangeTo)}, орох ${ubOf(v, rule.rangeTo)}–${ubOf(v, rule.entryTo)} (${zone}), target ${rule.rr}R, ${exitText(rule, v)}.`,
    `${name}: range ${ubOf(v, rule.rangeFrom)}–${ubOf(v, rule.rangeTo)}, entries ${ubOf(v, rule.rangeTo)}–${ubOf(v, rule.entryTo)} (${zone}), target ${rule.rr}R, ${exitText(rule, v)}.`,
  );
}

/** A setup's opening range, for chart legends: "Range 08:00–15:00". */
export const rangeLabel = (rule: SessionRule, v: Pick<Viewer, "t" | "ub">) => v.t(`Хүрээ ${ubOf(v, rule.rangeFrom)}–${ubOf(v, rule.rangeTo)}`, `Range ${ubOf(v, rule.rangeFrom)}–${ubOf(v, rule.rangeTo)}`);

/** The broker research record (BROKER_RECORD in lib/setup/build), whatever extra fields it carries. */
export type BrokerRecord = {
  n: number; winPct: number; profitFactor: number; from: string; to?: string; source: string; checkedOn: string;
  note?: string; // a short English label
  noteText?: { mn: string; en: string }; // the caveats in both languages
  label?: string;
};

/** Whole years from "2019-01" to its end ("2026-11", or the day it was checked), rounded. */
export function recordYears(r: Pick<BrokerRecord, "from" | "to" | "checkedOn">): number {
  const [fy, fm] = r.from.split("-").map(Number), [ty, tm] = (r.to ?? r.checkedOn).split("-").map(Number);
  return Math.max(1, Math.round(((ty - fy) * 12 + (tm - fm)) / 12));
}

/** The record's heading, the same on every page: dated research, not a live result. */
export const recordTitle = (r: BrokerRecord, t: T) =>
  r.label ?? t(`MT5 tester судалгаа, ${r.from} → ${(r.to ?? r.checkedOn).slice(0, 7)} (≈${recordYears(r)} жил)`, `MT5 tester research, ${r.from} → ${(r.to ?? r.checkedOn).slice(0, 7)} (≈${recordYears(r)} years)`);

/** The record in one sentence, with what it is and what it is not. */
export const recordSentence = (r: BrokerRecord, t: T) => {
  const caveat = r.noteText ? ` ${t(r.noteText.mn, r.noteText.en)}` : "";
  return t(`Азийн setup-ийг MT5 Strategy Tester дээр ${r.source}-ийн ${r.from}-аас хойших түүхээр шалгасан судалгаа (${r.checkedOn}): ${r.n} арилжаа, ${r.winPct}% ашигтай, Profit Factor ${r.profitFactor.toFixed(2)}.${caveat} Өнгөрсөн үр дүн ирээдүйг батлахгүй; эхлээд demo дансаар.`,
    `Research on the Asian setup in the MT5 Strategy Tester over ${r.source} history from ${r.from} (checked ${r.checkedOn}): ${r.n} trades, ${r.winPct}% won, Profit Factor ${r.profitFactor.toFixed(2)}.${caveat} Past results do not guarantee the future; start on a demo account.`);
};

/** Two back-to-back one-year test windows ending today, in the Strategy Tester's date format. */
export function testWindows(now: Date): [string, string][] {
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", ".");
  const back = (years: number) => { const d = new Date(now); d.setUTCFullYear(d.getUTCFullYear() - years); return d; };
  return [[fmt(back(2)), fmt(back(1))], [fmt(back(1)), fmt(now)]];
}

/** The site's public origin, for metadata, robots and the sitemap: APP_URL, else Railway's domain. */
export function siteOrigin(): string | null {
  const explicit = process.env.APP_URL?.trim();
  if (explicit && /^https?:\/\//i.test(explicit)) return explicit.replace(/\/+$/, "");
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  return railway ? `https://${railway.replace(/\/+$/, "")}` : null;
}
