"use client";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction, registerAction, type FormState } from "@/lib/actions/session";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "login" ? loginAction : registerAction, {});
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
    <Link href="/" className="mb-6 flex items-center gap-2 font-semibold tracking-tight text-zinc-50"><span aria-hidden className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-amber-400" />XAU Analytics</Link>
    <form action={action} className="card w-full max-w-sm space-y-4 sm:p-6">
      <h1 className="page-title">{mode === "login" ? "Нэвтрэх" : "Бүртгүүлэх"}</h1>
      {mode === "register" && (
        <div>
          <label className="label" htmlFor="name">Нэр</label>
          <input className="input" id="name" name="name" required maxLength={80} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Имэйл</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Нууц үг</label>
        <input className="input" id="password" name="password" type="password" required minLength={mode === "register" ? 8 : 1}
          autoComplete={mode === "login" ? "current-password" : "new-password"} />
        {mode === "register" && <p className="mt-1 text-xs text-zinc-500">8-аас дээш тэмдэгт</p>}
      </div>
      {state.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Түр хүлээнэ үү…" : mode === "login" ? "Нэвтрэх" : "Бүртгүүлэх"}</button>
      <p className="text-center text-sm text-zinc-400">
        {mode === "login" ? <>Бүртгэлгүй юу? <Link className="text-amber-400" href="/register">Бүртгүүлэх</Link></>
          : <>Бүртгэлтэй юу? <Link className="text-amber-400" href="/login">Нэвтрэх</Link></>}
      </p>
    </form>
    </main>
  );
}
