import { AuthForm } from "@/components/AuthForm";
import { getT } from "@/lib/prefs.server";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Нэвтрэх — XAU Analytics", "Sign in — XAU Analytics") };
}
export default function LoginPage() {
  return <AuthForm mode="login" />;
}
