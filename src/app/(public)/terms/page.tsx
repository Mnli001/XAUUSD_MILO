import { getViewer } from "@/lib/prefs.server";
import { TERMS, legalFor } from "@/lib/legalText";
import { LegalDoc } from "@/components/LegalDoc";
import { LEGAL_VERSION, legalName } from "@/lib/legal";
import { siteAdminContact } from "@/lib/contact";

export async function generateMetadata() {
  const { locale } = await getViewer();
  return { title: `${legalFor(TERMS, locale).title} — XAU Analytics` };
}

export default async function TermsPage() {
  const v = await getViewer();
  const contact = siteAdminContact();
  return <LegalDoc v={v} doc={legalFor(TERMS, v.locale)} fill={{ name: legalName(), contact: contact ? (contact.url ?? contact.text) : v.t("site-ын админ", "the site admin"), version: LEGAL_VERSION }} />;
}
