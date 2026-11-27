"use client";
import type { T } from "@/lib/i18n";
import type { DemoView } from "@/lib/demo/view";

export const px = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const usd = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const cash = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const tone = (n: number) => (n > 0 ? "text-emerald-400" : n < 0 ? "text-red-400" : "text-zinc-300");
export const num = (s: string) => { const v = Number(s.replace(",", ".").trim()); return s.trim() === "" || !Number.isFinite(v) ? null : v; };

export type ActionResult = { view?: DemoView; error?: string; profit?: number; closed?: number; account?: { id: string }; deleted?: boolean };

/** One change to a demo account through the API. */
export async function demoAction(payload: Record<string, unknown>): Promise<ActionResult> {
  try {
    const r = await fetch("/api/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    return (await r.json()) as ActionResult;
  } catch {
    return { error: "network" };
  }
}

export function errorText(code: string | undefined, t: T): string {
  switch (code) {
    case "closed": return t("Зах зээл хаалттай эсвэл live үнэ ирэхгүй байна. Үнэ ирэхэд дахин оролдоно уу.", "The market is closed or the live price is not coming in. Try again when it is.");
    case "lots": return t("Lot 0.01-ээс 50 хүртэл, 0.01-ийн алхамтай байна.", "Lots go from 0.01 to 50 in steps of 0.01.");
    case "price": return t("Захиалгын үнэ буруу талд байна. Buy Limit одоогийн үнээс доор, Buy Stop дээр; Sell Limit дээр, Sell Stop доор байна.", "The order price is on the wrong side: Buy Limit below the market, Buy Stop above; Sell Limit above, Sell Stop below.");
    case "sl": return t("SL буруу талд байна: BUY-д үнээс доор, SELL-д үнээс дээр.", "The stop loss is on the wrong side: below the price for a BUY, above it for a SELL.");
    case "tp": return t("TP буруу талд байна: BUY-д үнээс дээр, SELL-д үнээс доор.", "The take profit is on the wrong side: above the price for a BUY, below it for a SELL.");
    case "margin": return t("Free margin хүрэлцэхгүй байна. Lot-оо багасгах эсвэл данс руугаа мөнгө нэмнэ үү.", "Not enough free margin. Use fewer lots or add money to the account.");
    case "free": return t("Free margin-аас их мөнгө гаргах боломжгүй.", "You cannot withdraw more than the free margin.");
    case "amount": return t("Мөнгөн дүн буруу байна.", "That amount is not valid.");
    case "name": return t("Дансны нэр оруулна уу.", "Enter a name for the account.");
    case "balance": return t("Эхлэх мөнгө $10-аас $10,000,000 хооронд байна.", "The starting balance goes from $10 to $10,000,000.");
    case "leverage": return t("Leverage-ээ сонгоно уу.", "Choose a leverage.");
    case "max": return t("Дээд тал нь 3 demo данс нээж болно.", "You can have up to 3 demo accounts.");
    case "network": return t("Холболт тасарлаа. Дахин оролдоно уу.", "The connection dropped. Try again.");
    default: return t("Олдсонгүй. Хуудсаа дахин ачаална уу.", "Not found. Reload the page.");
  }
}

export const reasonText = (r: string | null, t: T) =>
  r === "SL" ? "SL" : r === "TP" ? "TP" : r === "STOPOUT" ? "Stop-out" : r === "MARGIN" ? t("Margin хүрэлцээгүй", "No margin") : t("Гараар", "By hand");
