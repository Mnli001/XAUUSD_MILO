import { GLOSSARY_GROUPS, glossaryEntry } from "@/lib/glossary";
import { getT, getViewer } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Нэр томьёо", "Glossary") };
}

/** Every trading word the site uses, explained plainly. Each term has its own anchor (/glossary#atr) for the ? hints to link to. */
export default async function GlossaryPage() {
  const { t } = await getViewer();
  return (
    <div className="reveal space-y-5 sm:space-y-7">
      <header>
        <h1 className="page-title">{t("Нэр томьёо", "Glossary")}</h1>
        <p className="page-lede mt-3">{t("Сайтад гардаг арилжааны үг бүрийн энгийн тайлбар. Шинээр эхэлж байгаа бол эхлээд “Үндсэн ойлголт”-ыг уншаарай.", "A plain explanation of every trading word the site uses. If you are new, start with “The basics”.")}</p>
        <nav aria-label={t("Бүлгүүд", "Sections")} className="mt-4 flex flex-wrap gap-2">
          {GLOSSARY_GROUPS.map((g) => (
            <a key={g.id} href={`#${g.id}`} className="btn-ghost text-sm">{t(g.title.mn, g.title.en)}</a>
          ))}
        </nav>
      </header>
      {GLOSSARY_GROUPS.map((g) => (
        <section key={g.id} id={g.id} className="card scroll-mt-24" aria-labelledby={`${g.id}-h`}>
          <h2 id={`${g.id}-h`} className="card-title">{t(g.title.mn, g.title.en)}</h2>
          <dl className="mt-3 divide-y" style={{ borderColor: "var(--hairline)" }}>
            {g.ids.map((id) => {
              const e = glossaryEntry(id);
              return (
                <div key={id} id={id} className="scroll-mt-24 rounded-xl py-3.5 transition-colors target:bg-amber-400/10 target:px-3" style={{ borderColor: "var(--hairline)" }}>
                  <dt className="font-semibold text-zinc-50">{t(e.term.mn, e.term.en)}</dt>
                  <dd className="mt-1 max-w-prose text-sm leading-relaxed text-zinc-300">{t(e.def.mn, e.def.en)}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
