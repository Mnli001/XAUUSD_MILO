import { AuthForm } from "@/components/AuthForm";
import { getT } from "@/lib/prefs.server";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Бүртгүүлэх — XAU Analytics", "Register — XAU Analytics") };
}
export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
