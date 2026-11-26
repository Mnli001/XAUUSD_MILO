import Link from "next/link";
import type { T } from "@/lib/i18n";

/** Shown to everyone who has not accepted the current privacy policy and terms (accounts from before, or a new version). */
export function ConsentBanner({ t, accept }: { t: T; accept: () => Promise<void> }) {
  return (
    <section role="region" aria-label={t("Нууцлал ба нөхцөл", "Privacy and terms")} className="glass-banner mb-5 flex flex-wrap items-center gap-3 sm:mb-7">
      <p className="min-w-0 flex-[1_1_16rem] text-sm leading-relaxed text-zinc-200">
        {t("Бид ", "We have published our ")}
        <Link href="/privacy" className="font-semibold text-zinc-50 underline decoration-amber-400/60 underline-offset-2">{t("Нууцлалын бодлого", "privacy policy")}</Link>
        {t(" болон ", " and ")}
        <Link href="/terms" className="font-semibold text-zinc-50 underline decoration-amber-400/60 underline-offset-2">{t("Үйлчилгээний нөхцөл", "terms of service")}</Link>
        {t("-ийг нийтэллээ. Таны ямар мэдээллийг юунд ашигладгийг уншаад зөвшөөрнө үү.", ". Please read what we keep about you and why, and accept them.")}
      </p>
      <form action={accept}><button className="btn">{t("Уншсан, зөвшөөрч байна", "I have read them and accept")}</button></form>
    </section>
  );
}
