import { tradePnl, tradeR } from "./analysis/journal";
import type { TradeRow } from "./trades";
import type { Viewer } from "./viewer";

/** Quotes a field when it must be, and stops a note that looks like a formula from running in a spreadsheet. */
function cell(v: string | number | null): string {
  if (v === null) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** The journal as a CSV file that Excel opens directly (UTF-8 with a BOM, CRLF rows). */
export function tradesCsv(trades: TradeRow[], v: Viewer): string {
  const { t } = v;
  const head = [
    `${t("Нээсэн", "Opened")} (${v.zone})`, `${t("Хаасан", "Closed")} (${v.zone})`, t("Хэрэгсэл", "Symbol"), t("Чиглэл", "Side"), t("Лот", "Lots"),
    t("Орсон үнэ", "Entry"), t("Гарсан үнэ", "Exit"), "Stop loss", "Take profit", t("Ашиг $", "Profit $"), "R", t("Тэмдэглэл", "Note"),
  ];
  const rows = trades.map((tr) => {
    const pnl = tradePnl(tr), r = tradeR(tr);
    return [
      v.dateTime(tr.openedAt), tr.closedAt ? v.dateTime(tr.closedAt) : null, tr.symbol, tr.direction, tr.lots, tr.entryPrice, tr.exitPrice, tr.stopLoss, tr.takeProfit,
      pnl === null ? null : pnl.toFixed(2), r === null ? null : r.toFixed(2), tr.note,
    ];
  });
  return "﻿" + [head, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
