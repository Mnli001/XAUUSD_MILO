import { AuthForm } from "@/components/AuthForm";
export const metadata = { title: "Бүртгүүлэх — XAU Analytics" };
export default function RegisterPage() {
  return <main className="px-4"><AuthForm mode="register" /></main>;
}
