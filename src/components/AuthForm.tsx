"use client";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction, registerAction, type FormState } from "@/lib/actions/session";
import { usePrefs, useT } from "./PrefsProvider";
import { LanguageSwitch } from "./LanguageSwitch";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const t = useT();
  const { locale } = usePrefs();
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "login" ? loginAction : registerAction, {});
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
    <Link href="/" className="mb-6 flex items-center gap-2 font-semibold tracking-tight text-zinc-50"><span aria-hidden className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-amber-400" />XAU Analytics</Link>
    <div className="mb-3 flex w-full max-w-sm justify-end"><LanguageSwitch locale={locale} /></div>
    <form action={action} className="card w-full max-w-sm space-y-4 sm:p-6">
      <h1 className="page-title">{mode === "login" ? t("Нэвтрэх", "Sign in") : t("Бүртгүүлэх", "Register")}</h1>
      {mode === "register" && (
        <div>
          <label className="label" htmlFor="name">{t("Нэр", "Name")}</label>
          <input className="input" id="name" name="name" required maxLength={80} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">{t("Имэйл", "Email")}</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">{t("Нууц үг", "Password")}</label>
        <input className="input" id="password" name="password" type="password" required minLength={mode === "register" ? 8 : 1}
          autoComplete={mode === "login" ? "current-password" : "new-password"} />
        {mode === "register" && <p className="mt-1 text-xs text-zinc-500">{t("8-аас дээш тэмдэгт", "8 characters or more")}</p>}
      </div>
      {state.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? t("Түр хүлээнэ үү…", "Please wait…") : mode === "login" ? t("Нэвтрэх", "Sign in") : t("Бүртгүүлэх", "Register")}</button>
      <p className="text-center text-sm text-zinc-400">
        {mode === "login" ? <>{t("Бүртгэлгүй юу?", "No account?")} <Link className="text-amber-400" href="/register">{t("Бүртгүүлэх", "Register")}</Link></>
          : <>{t("Бүртгэлтэй юу?", "Already registered?")} <Link className="text-amber-400" href="/login">{t("Нэвтрэх", "Sign in")}</Link></>}
      </p>
    </form>
    </main>
  );
}
