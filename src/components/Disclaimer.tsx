import type { T } from "@/lib/i18n";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";

export const disclaimerText = (t: T) => t("Өнгөрсөн түүхэн статистикт суурилсан тооцоолол. Санхүүгийн болон арилжааны шууд зөвлөгөө биш — эрсдэлээ өөрөө хариуцна уу.", "Based on historical statistical calculations. Not financial advice — trade at your own risk.");
export function Disclaimer({ v = MN_VIEWER }: { v?: Viewer }) {
  return <p className="border-t border-zinc-800 px-4 py-4 text-center text-xs leading-relaxed text-zinc-500">{disclaimerText(v.t)}</p>;
}
