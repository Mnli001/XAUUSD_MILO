import { getViewer } from "@/lib/prefs.server";
import { PRIVACY } from "@/lib/legalText";
import { LegalDoc } from "@/components/LegalDoc";
import { LEGAL_VERSION, legalName } from "@/lib/legal";
import { siteAdminContact } from "@/lib/contact";

export async function generateMetadata() {
  const { locale } = await getViewer();
  return { title: `${PRIVACY[locale].title} — XAU Analytics` };
}

export default async function PrivacyPage() {
  const v = await getViewer();
  const contact = siteAdminContact();
  return <LegalDoc v={v} doc={PRIVACY[v.locale]} fill={{ name: legalName(), contact: contact ? (contact.url ?? contact.text) : v.t("сайтын админ", "the site admin"), version: LEGAL_VERSION }} />;
}
