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
const C = {
  bg: "#f3f2ee", grid: "#e2e0d9", text: "#1c1a16", muted: "#6b6558", up: "#ffffff", down: "#1c1a16", wick: "#1c1a16",
  stopFill: "rgba(214, 69, 65, 0.18)", stopLine: "#d64541", targetFill: "rgba(66, 103, 214, 0.22)", targetLine: "#3a5fcd",
  win: "#1f8a5b", loss: "#d64541", time: "#9a6b00",
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
  out.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
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
  out.push(`<line x1="${zx0}" x2="${zx1}" y1="${yE}" y2="${yE}" stroke="${C.text}" stroke-width="1.5" stroke-dasharray="6 4"/>`);
  // candles
  const bw = Math.max(1.5, step * 0.62);
  bars.forEach((b, i) => {
    const up = b.close >= b.open, top = y(Math.max(b.open, b.close)), bot = y(Math.min(b.open, b.close));
    out.push(`<line x1="${x(i)}" x2="${x(i)}" y1="${y(b.high)}" y2="${y(b.low)}" stroke="${C.wick}" stroke-width="1.2"/>`);
    out.push(`<rect x="${x(i) - bw / 2}" y="${top}" width="${bw}" height="${Math.max(1, bot - top)}" fill="${up ? C.up : C.down}" stroke="${C.wick}" stroke-width="1"/>`);
  });
  // exit marker
  if (c.exit) {
    const col = c.exit.kind === "WIN" ? C.win : c.exit.kind === "LOSS" ? C.loss : C.time;
    out.push(`<circle cx="${zx1}" cy="${y(c.exit.price)}" r="8" fill="${col}" stroke="#ffffff" stroke-width="2.5"/>`);
  }
  // price tags on the axis
  const tag = (p: number, fill: string, ink: string) => {
    const ty = Math.min(Math.max(y(p), TOP + 10), H - BOTTOM - 10);
    out.push(`<rect x="${W - PAD_R + 4}" y="${ty - 11}" width="${PAD_R - 8}" height="22" rx="3" fill="${fill}"/>`);
    out.push(`<text x="${W - PAD_R + 10}" y="${ty + 5}" font-size="14" font-weight="bold" fill="${ink}">${fx(p)}</text>`);
  };
  tag(c.stop, C.stopLine, "#ffffff");
  tag(c.target, C.targetLine, "#ffffff");
  tag(c.entry, "#ffffff", C.text);
  // header
  out.push(`<text x="${PAD_L + 4}" y="40" font-size="26" font-weight="bold" fill="${C.text}">${esc(c.title)}</text>`);
  out.push(`<text x="${PAD_L + 4}" y="70" font-size="16" fill="${C.muted}">${esc(c.subtitle)}</text>`);
  if (c.badge) {
    const col = c.badge.kind === "WIN" ? C.win : c.badge.kind === "LOSS" ? C.loss : C.time;
    const bw2 = 20 + c.badge.text.length * 13;
    out.push(`<rect x="${W - 16 - bw2}" y="18" width="${bw2}" height="36" rx="18" fill="${col}"/>`);
    out.push(`<text x="${W - 16 - bw2 / 2}" y="43" font-size="20" font-weight="bold" fill="#ffffff" text-anchor="middle">${esc(c.badge.text)}</text>`);
    out.push(`<text x="${W - 16}" y="76" font-size="14" fill="${C.muted}" text-anchor="end">XAUUSD · 15m</text>`);
  } else out.push(`<text x="${W - 16}" y="40" font-size="14" fill="${C.muted}" text-anchor="end">XAUUSD · 15m</text>`);
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
