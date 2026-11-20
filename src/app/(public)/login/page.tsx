import { AuthForm } from "@/components/AuthForm";
export const metadata = { title: "Нэвтрэх — XAU Analytics" };
export default function LoginPage() {
  return <main className="px-4"><AuthForm mode="login" /></main>;
}
