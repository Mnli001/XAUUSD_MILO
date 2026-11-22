import type { T } from "@/lib/i18n";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";

export const disclaimerText = (t: T) => t("Түүхэн статистик дээр суурилсан тооцоо. Санхүүгийн зөвлөгөө биш.", "Estimates based on historical statistics. Not financial advice.");
export function Disclaimer({ v = MN_VIEWER }: { v?: Viewer }) {
  return <p className="border-t border-zinc-800 px-4 py-4 text-center text-xs leading-relaxed text-zinc-500">{disclaimerText(v.t)}</p>;
}
