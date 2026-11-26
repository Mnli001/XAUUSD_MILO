import Link from "next/link";
import type { T } from "@/lib/i18n";

/** A first-visit card on Today: the order to use the site in, where the words are explained, and a button to put it away. */
export function StartGuide({ t, dismiss }: { t: T; dismiss: () => Promise<void> }) {
  const steps = [
    [t("Өнөөдөр", "Today"), t("өнөөдөр аль тал давамгай, аль цагт алт ихэвчлэн өсдөг эсвэл буурдаг, ямар чухал мэдээ гарахыг хар.", "see which side leads today, at which hours gold usually rises or falls, and which important news is coming.")],
    ["Setup", t("дүрэм бүрийн нөхцөл биелсэн эсэхийг шалга. Зөвхөн “Идэвхтэй” үед орох үнэ, stop, target бэлэн болно; “Ажиглах”, “Бүрдэж байна” бол хүлээ.", "check whether each rule's conditions are met. Only when it says “Active” are the entry, stop and target ready; on “Watch” or “Forming”, wait.")],
    [t("Гүйцэтгэл", "Performance"), t("MT5 роботоо холбовол хаасан арилжаа бүр нь автоматаар тооцогдож, юу ажиллаж, юу ажиллахгүй байгааг харуулна.", "connect your MT5 robot and every trade it closes is counted automatically, showing what works and what does not.")]
  ] as const;
  return (
    <section className="card border-amber-400/25" aria-labelledby="start-h">
      <h2 id="start-h" className="card-title">{t("Хаанаас эхлэх вэ?", "Where to start")}</h2>
      <ol className="mt-4 space-y-3">
        {steps.map(([page, what], i) => (
          <li key={page} className="flex gap-3 text-sm leading-relaxed text-zinc-300">
            <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-400/40 text-xs font-semibold text-amber-300 tabular-nums">{i + 1}</span>
            <span><strong className="font-semibold text-zinc-50">{page}:</strong> {what}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm leading-relaxed text-zinc-400">
        {t("Үг ойлгомжгүй бол хажууд нь байгаа ? тэмдгийг дар. Бүх үгийн тайлбар:", "If a word is unclear, tap the ? beside it. Every term explained:")}{" "}
        <Link href="/glossary" className="font-semibold text-amber-300 underline decoration-amber-400/50 underline-offset-4 hover:text-amber-200">{t("Нэр томьёо", "Glossary")}</Link>
      </p>
      <p className="mt-1 text-sm leading-relaxed text-zinc-400">{t("Бот ашиглах бол эхлээд demo дансанд туршаарай.", "If you use the bot, try it on a demo account first.")}</p>
      <form action={dismiss} className="mt-4"><button className="btn-ghost">{t("Ойлголоо", "Got it")}</button></form>
    </section>
  );
}
