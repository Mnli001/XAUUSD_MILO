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
    <div className="mb-5 flex w-full max-w-sm items-center justify-between">
      <Link href="/" className="flex items-center gap-2.5 font-bold tracking-[-0.01em] text-zinc-50">
        <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400"><span className="h-2 w-2 rounded-full bg-zinc-950" /></span>XAU Analytics
      </Link>
      <LanguageSwitch locale={locale} />
    </div>
    <form action={action} className="card w-full max-w-sm space-y-4 pt-0 sm:p-6 sm:pt-0">
      {/* The day in miniature: the three session lines with their stations. */}
      <div aria-hidden className="relative mt-6 mb-5 flex h-3 items-center gap-1">
        <span className="h-[5px] flex-[7] rounded-full bg-asia" /><span className="h-[5px] flex-[6] rounded-full bg-london" /><span className="h-[5px] flex-[8] rounded-full bg-ny" />
        <span className="absolute left-[33%] h-[11px] w-[11px] -translate-x-1/2 rounded-full border-[3px] border-zinc-900 bg-zinc-50" />
        <span className="absolute left-[62%] h-[11px] w-[11px] -translate-x-1/2 rounded-full border-[3px] border-zinc-900 bg-zinc-50" />
      </div>
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
        {mode === "login" ? <>{t("Бүртгэлгүй юу?", "No account?")} <Link className="font-semibold text-zinc-50 underline decoration-amber-400 decoration-2" href="/register">{t("Бүртгүүлэх", "Register")}</Link></>
          : <>{t("Бүртгэлтэй юу?", "Already registered?")} <Link className="font-semibold text-zinc-50 underline decoration-amber-400 decoration-2" href="/login">{t("Нэвтрэх", "Sign in")}</Link></>}
      </p>
    </form>
    </main>
  );
}
