import path from "node:path";
import type { Candle } from "./analysis/indicators";

/**
 * A trade drawn the way TradingView's long/short position tool draws it: 15-minute candles, the entry line,
 * a red stop zone and a blue target zone running from the entry to the exit, and the exit marked.
 * Built as SVG and turned into a PNG on the server, so Telegram gets a picture with no outside service.
 */
export type TradeChart = {
  bars: readonly Candle[];
  side: "BUY" | "SELL";
  entry: number;
  stop: number;
  target: number;
  openedAt: Date; // when the signal went out
  exit?: { at: Date; price: number; kind: "WIN" | "LOSS" | "TIME" } | null;
  title: string; // the headline over the chart
  subtitle: string; // the rule and the result, smaller
  badge?: { text: string; kind: "WIN" | "LOSS" | "TIME" } | null; // the result, as a coloured pill top right
  clock: (d: Date) => string; // "15:45" on the reader's clock
};

const W = 1200, H = 675;
const PAD_L = 16, PAD_R = 112, TOP = 92, BOTTOM = 52;
const M15 = 15 * 6e4;
/** Black and gold, like the site: gold candles rising, dark candles with a bronze edge falling. */
const C = {
  bg: "#0e0d0b", panel: "#15130f", grid: "#24211b", text: "#f1ead8", muted: "#9c927c", gold: "#d9b566", goldDeep: "#a8822f",
  up: "#d9b566", upEdge: "#e8c97f", down: "#1d1a14", downEdge: "#8a7448",
  stopFill: "rgba(196, 72, 58, 0.20)", stopLine: "#c4483a", targetFill: "rgba(217, 181, 102, 0.16)", targetLine: "#d9b566",
  win: "#d9b566", loss: "#c4483a", time: "#8a8272",
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fx = (v: number) => v.toFixed(2);

export function tradeChartSvg(c: TradeChart): string {
  const openT = Math.floor(c.openedAt.getTime() / M15) * M15;
  const endT = c.exit ? c.exit.at.getTime() : (c.bars.at(-1)?.time.getTime() ?? openT) + M15;
  // About 40 bars before the entry for context, the trade itself, and a few bars after the exit.
  const from = openT - 40 * M15, to = endT + 8 * M15;
  const bars = c.bars.filter((b) => b.time.getTime() >= from && b.time.getTime() < to).slice(-140);
  const prices = [c.entry, c.stop, c.target, ...bars.flatMap((b) => [b.high, b.low])];
  let lo = Math.min(...prices), hi = Math.max(...prices);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const plotW = W - PAD_L - PAD_R, plotH = H - TOP - BOTTOM;
  const n = Math.max(bars.length, 1);
  const step = plotW / n;
  const x = (i: number) => PAD_L + step * (i + 0.5);
  const y = (p: number) => TOP + ((hi - p) / (hi - lo)) * plotH;
  const idxAt = (t: number) => {
    const i = bars.findIndex((b) => b.time.getTime() >= t);
    return i < 0 ? bars.length - 1 : i;
  };
  const i0 = idxAt(openT), i1 = c.exit ? idxAt(Math.floor(c.exit.at.getTime() / M15) * M15 - M15) : bars.length - 1;
  const zx0 = PAD_L + step * i0, zx1 = Math.max(zx0 + step * 2, PAD_L + step * (i1 + 1));
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans">`);
  out.push(`<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.panel}"/><stop offset="1" stop-color="${C.bg}"/></linearGradient></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);
  out.push(`<rect width="${W}" height="4" fill="${C.gold}"/>`);
  // price grid: about six round levels
  const raw = (hi - lo) / 6, mag = 10 ** Math.floor(Math.log10(raw)), gridStep = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  for (let p = Math.ceil(lo / gridStep) * gridStep; p <= hi; p += gridStep) {
    out.push(`<line x1="${PAD_L}" x2="${W - PAD_R}" y1="${y(p)}" y2="${y(p)}" stroke="${C.grid}" stroke-width="1"/>`);
    out.push(`<text x="${W - PAD_R + 10}" y="${y(p) + 4}" font-size="13" fill="${C.muted}">${fx(p)}</text>`);
  }
  // time axis: a label every ~2 hours
  const every = Math.max(1, Math.round(8 * (n / 100)));
  bars.forEach((b, i) => { if (i % every === 0) out.push(`<text x="${x(i)}" y="${H - BOTTOM + 24}" font-size="13" fill="${C.muted}" text-anchor="middle">${esc(c.clock(b.time))}</text>`); });
  // zones
  const yE = y(c.entry), yS = y(c.stop), yT = y(c.target);
  out.push(`<rect x="${zx0}" y="${Math.min(yE, yS)}" width="${zx1 - zx0}" height="${Math.abs(yS - yE)}" fill="${C.stopFill}"/>`);
  out.push(`<rect x="${zx0}" y="${Math.min(yE, yT)}" width="${zx1 - zx0}" height="${Math.abs(yT - yE)}" fill="${C.targetFill}"/>`);
  out.push(`<line x1="${zx0}" x2="${zx1}" y1="${yE}" y2="${yE}" stroke="${C.gold}" stroke-width="1.6" stroke-dasharray="6 4"/>`);
  out.push(`<line x1="${zx0}" x2="${zx1}" y1="${yS}" y2="${yS}" stroke="${C.stopLine}" stroke-width="1.2"/>`);
  out.push(`<line x1="${zx0}" x2="${zx1}" y1="${yT}" y2="${yT}" stroke="${C.targetLine}" stroke-width="1.2"/>`);
  // candles
  const bw = Math.max(1.5, step * 0.62);
  bars.forEach((b, i) => {
    const up = b.close >= b.open, top = y(Math.max(b.open, b.close)), bot = y(Math.min(b.open, b.close));
    const edge = up ? C.upEdge : C.downEdge;
    out.push(`<line x1="${x(i)}" x2="${x(i)}" y1="${y(b.high)}" y2="${y(b.low)}" stroke="${edge}" stroke-width="1.2"/>`);
    out.push(`<rect x="${x(i) - bw / 2}" y="${top}" width="${bw}" height="${Math.max(1, bot - top)}" fill="${up ? C.up : C.down}" stroke="${edge}" stroke-width="1"/>`);
  });
  // exit marker
  if (c.exit) {
    const col = c.exit.kind === "WIN" ? C.win : c.exit.kind === "LOSS" ? C.loss : C.time;
    out.push(`<circle cx="${zx1}" cy="${y(c.exit.price)}" r="8" fill="${col}" stroke="${C.bg}" stroke-width="3"/>`);
  }
  // price tags on the axis
  const tag = (p: number, fill: string, ink: string) => {
    const ty = Math.min(Math.max(y(p), TOP + 10), H - BOTTOM - 10);
    out.push(`<rect x="${W - PAD_R + 4}" y="${ty - 11}" width="${PAD_R - 8}" height="22" rx="3" fill="${fill}"/>`);
    out.push(`<text x="${W - PAD_R + 10}" y="${ty + 5}" font-size="14" font-weight="bold" fill="${ink}">${fx(p)}</text>`);
  };
  tag(c.stop, C.stopLine, "#fff4ee");
  tag(c.target, C.gold, C.bg);
  tag(c.entry, "#2a2519", C.gold);
  // header
  out.push(`<text x="${PAD_L + 4}" y="40" font-size="26" font-weight="bold" fill="${C.text}">${esc(c.title)}</text>`);
  out.push(`<text x="${PAD_L + 4}" y="70" font-size="16" fill="${C.muted}">${esc(c.subtitle)}</text>`);
  if (c.badge) {
    const col = c.badge.kind === "WIN" ? C.win : c.badge.kind === "LOSS" ? C.loss : C.time;
    const bw2 = 20 + c.badge.text.length * 13;
    out.push(`<rect x="${W - 16 - bw2}" y="18" width="${bw2}" height="36" rx="18" fill="${col}"/>`);
    out.push(`<text x="${W - 16 - bw2 / 2}" y="43" font-size="20" font-weight="bold" fill="${c.badge.kind === "LOSS" ? "#fff4ee" : C.bg}" text-anchor="middle">${esc(c.badge.text)}</text>`);
    out.push(`<text x="${W - 16}" y="76" font-size="14" fill="${C.muted}" text-anchor="end">XAUUSD · 15m</text>`);
  } else out.push(`<text x="${W - 16}" y="40" font-size="14" fill="${C.muted}" text-anchor="end">XAUUSD · 15m</text>`);
  out.push(`<text x="${W - PAD_R - 8}" y="${H - BOTTOM - 10}" font-size="13" font-weight="bold" fill="${C.goldDeep}" text-anchor="end" opacity="0.8">XAU Analytics</text>`);
  out.push(`</svg>`);
  return out.join("");
}

const FONTS = ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"].map((f) => path.join(process.cwd(), "assets", "fonts", f));

/** The chart as a PNG, or null when the renderer is not available (the caller then sends text only). */
export async function tradeChartPng(c: TradeChart): Promise<Buffer | null> {
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const r = new Resvg(tradeChartSvg(c), { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "DejaVu Sans" }, fitTo: { mode: "width", value: W } });
    return r.render().asPng();
  } catch (e) {
    console.error("[chart] render failed", e instanceof Error ? e.message : e);
    return null;
  }
}
