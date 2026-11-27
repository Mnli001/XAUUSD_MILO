import Link from "next/link";
import type { T } from "@/lib/i18n";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";

export const disclaimerText = (t: T) => t("Өнгөрсөн түүхэн статистикт суурилсан тооцоолол. Санхүүгийн болон арилжааны шууд зөвлөгөө биш — эрсдэлээ өөрөө хариуцна уу.", "Based on historical statistical calculations. Not financial advice — trade at your own risk.");
export function Disclaimer({ v = MN_VIEWER }: { v?: Viewer }) {
  const { t } = v;
  return (
    <div className="border-t border-zinc-800 px-4 py-4 text-center text-xs leading-relaxed text-zinc-500">
      <p>{disclaimerText(t)}</p>
      <p className="mt-1.5 flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link href="/guide/vps" className="underline-offset-2 hover:text-zinc-300 hover:underline">{t("Robot-ыг 24/7 ажиллуулах (VPS)", "Run the robot 24/7 (VPS)")}</Link>
        <Link href="/privacy" className="underline-offset-2 hover:text-zinc-300 hover:underline">{t("Нууцлалын бодлого", "Privacy policy")}</Link>
        <Link href="/terms" className="underline-offset-2 hover:text-zinc-300 hover:underline">{t("Үйлчилгээний нөхцөл", "Terms of service")}</Link>
      </p>
    </div>
  );
}
