import { AuthForm } from "@/components/AuthForm";
import { getT } from "@/lib/prefs.server";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Бүртгүүлэх", "Register") };
}
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return <AuthForm mode="register" refCode={typeof ref === "string" && /^[A-Za-z0-9]{4,16}$/.test(ref) ? ref : undefined} />;
}
