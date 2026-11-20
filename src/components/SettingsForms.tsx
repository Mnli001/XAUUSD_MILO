"use client";
import { useActionState } from "react";
import { changeNameAction, changePasswordAction, type AdminState } from "@/lib/actions/admin";

function Feedback({ state }: { state: AdminState }) {
  if (state.error) return <p role="alert" className="text-sm text-red-400">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-sm text-emerald-400">{state.ok}</p>;
  return null;
}

export function SettingsForms({ name, email }: { name: string; email: string }) {
  const [nameState, nameAction, namePending] = useActionState<AdminState, FormData>(changeNameAction, {});
  const [pwState, pwAction, pwPending] = useActionState<AdminState, FormData>(changePasswordAction, {});
  return (
    <div className="grid max-w-3xl gap-4 md:grid-cols-2">
      <form action={nameAction} className="card space-y-3">
        <h2 className="text-sm font-medium text-zinc-400">Профайл</h2>
        <div><span className="label">Имэйл</span><p className="text-sm">{email}</p></div>
        <div><label className="label" htmlFor="name">Нэр</label><input className="input" id="name" name="name" defaultValue={name} required maxLength={80} /></div>
        <Feedback state={nameState} />
        <button className="btn" disabled={namePending}>Хадгалах</button>
      </form>
      <form action={pwAction} className="card space-y-3">
        <h2 className="text-sm font-medium text-zinc-400">Нууц үг солих</h2>
        <div><label className="label" htmlFor="current">Одоогийн нууц үг</label><input className="input" id="current" name="current" type="password" required autoComplete="current-password" /></div>
        <div><label className="label" htmlFor="next">Шинэ нууц үг (8-аас дээш тэмдэгт)</label><input className="input" id="next" name="next" type="password" required minLength={8} autoComplete="new-password" /></div>
        <Feedback state={pwState} />
        <button className="btn" disabled={pwPending}>Солих</button>
      </form>
    </div>
  );
}
