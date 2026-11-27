"use client";
import { useActionState, useRef } from "react";
import { changeNameAction, changePasswordAction, type AdminState } from "@/lib/actions/admin";
import { deleteAccountAction, savePrefsAction, saveSignalPrefsAction, type SettingsState } from "@/lib/actions/settings";
import type { Prefs } from "@/lib/prefs";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n";
import { TIME_ZONES } from "@/lib/prefs";
import { zoneShiftMs } from "@/lib/time";
import { useT, useViewer } from "./PrefsProvider";

function Feedback({ state }: { state: { error?: string; ok?: string } }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{state.error}</p>;
  if (state.ok) return <p role="status" className="flex items-center gap-2 text-sm text-emerald-400"><span aria-hidden className="h-2 w-2 rounded-full bg-emerald-400" />{state.ok}</p>;
  return null;
}

export function ProfileForm({ name, email, access }: { name: string; email: string; access: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<AdminState, FormData>(changeNameAction, {});
  return (
    <form action={action} className="card space-y-3">
      <h2 className="card-title">{t("Хувийн мэдээлэл", "Personal details")}</h2>
      <div><span className="label">{t("Имэйл", "Email")}</span><p className="text-sm break-all text-zinc-100">{email}</p></div>
      <div><label className="label" htmlFor="name">{t("Нэр", "Name")}</label><input className="input" id="name" name="name" defaultValue={name} required maxLength={80} /></div>
      <div><span className="label">{t("Эрхийн хугацаа", "Access")}</span><p className="text-sm text-zinc-300">{access}</p></div>
      <Feedback state={state} />
      <button className="btn" disabled={pending}>{t("Хадгалах", "Save")}</button>
    </form>
  );
}

export function PasswordForm() {
  const t = useT();
  const [state, action, pending] = useActionState<AdminState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="card space-y-3">
      <h2 className="card-title">{t("Нууц үг солих", "Change password")}</h2>
      <div><label className="label" htmlFor="current">{t("Одоогийн нууц үг", "Current password")}</label><input className="input" id="current" name="current" type="password" required autoComplete="current-password" /></div>
      <div><label className="label" htmlFor="next">{t("Шинэ нууц үг (8-аас дээш тэмдэгт)", "New password (8 characters or more)")}</label><input className="input" id="next" name="next" type="password" required minLength={8} autoComplete="new-password" /></div>
      <Feedback state={state} />
      <button className="btn" disabled={pending}>{t("Солих", "Change")}</button>
    </form>
  );
}

/** A row of choices that reads as one control; picking one saves it straight away. */
function Choice({ name, label, value, options }: { name: string; label: string; value: string; options: [string, string][] }) {
  return (
    <div role="radiogroup" aria-label={label}>
      <div className="label">{label}</div>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-zinc-700 bg-zinc-950 p-1">
        {options.map(([v, text]) => (
          <label key={v} className="cursor-pointer">
            <input type="radio" name={name} value={v} defaultChecked={v === value} className="peer sr-only" onChange={(e) => e.currentTarget.form?.requestSubmit()} />
            <span className="flex min-h-10 items-center rounded-lg px-3.5 text-sm text-zinc-300 transition-colors peer-checked:bg-[var(--accent-bg)] peer-checked:font-semibold peer-checked:text-[var(--accent-fg)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-amber-400 sm:min-h-9">{text}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function AppearanceForm({ prefs }: { prefs: Prefs }) {
  const t = useT();
  const [state, action] = useActionState<SettingsState, FormData>(savePrefsAction, {});
  return (
    <form action={action} className="card space-y-4">
      <h2 className="card-title">{t("Харагдац", "Appearance")}</h2>
      <div>
        <label className="label" htmlFor="locale">{t("Хэл", "Language")}</label>
        <select className="input max-w-xs" id="locale" name="locale" defaultValue={prefs.locale} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          {LOCALES.map((l) => <option key={l} value={l} lang={l}>{LOCALE_NAMES[l]}</option>)}
        </select>
      </div>
      <Choice name="theme" label={t("Өнгөний горим", "Theme")} value={prefs.theme} options={[["dark", t("Бараан", "Dark")], ["light", t("Цайвар", "Light")], ["system", t("Төхөөрөмжийг дагах", "Follow device")]]} />
      <Feedback state={state} />
      <noscript><button className="btn">{t("Хадгалах", "Save")}</button></noscript>
    </form>
  );
}

const offsetLabel = (timeZone: string, now: Date) => {
  const minutes = Math.round(zoneShiftMs(now, timeZone) / 6e4);
  const abs = Math.abs(minutes);
  return `UTC${minutes < 0 ? "-" : "+"}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
};
const cityOf = (timeZone: string) => timeZone.slice(timeZone.lastIndexOf("/") + 1).replaceAll("_", " ");

export function TimeZoneForm({ timeZone, now }: { timeZone: string; now: Date }) {
  const { t, time } = useViewer();
  const [state, action] = useActionState<SettingsState, FormData>(savePrefsAction, {});
  const select = useRef<HTMLSelectElement>(null);
  const zones = (TIME_ZONES.includes(timeZone) ? TIME_ZONES : [...TIME_ZONES, timeZone])
    .map((z) => ({ z, shift: zoneShiftMs(now, z) }))
    .sort((a, b) => a.shift - b.shift || a.z.localeCompare(b.z));
  const useDevice = () => {
    const el = select.current;
    if (!el) return;
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (![...el.options].some((o) => o.value === device)) el.add(new Option(`(${offsetLabel(device, new Date())}) ${cityOf(device)}`, device));
    el.value = device;
    el.form?.requestSubmit();
  };
  return (
    <form action={action} className="card space-y-3">
      <h2 className="card-title">{t("Цагийн бүс", "Time zone")}</h2>
      <p className="text-sm leading-relaxed text-zinc-400">{t("Мэдээний цаг, цагийн магадлал, роботын арилжаа, дохионы цагийг энэ бүсээр харуулна. Дүрмийн цагууд ч мөн энэ бүс рүү хөрвөнө.", "News times, hourly odds, robot trades and signal times are shown in this zone. The hours in the rules are converted to it as well.")}</p>
      <div>
        <label className="label" htmlFor="timeZone">{t("Цагийн бүс", "Time zone")}</label>
        <select ref={select} className="input" id="timeZone" name="timeZone" defaultValue={timeZone} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          {zones.map(({ z }) => <option key={z} value={z}>{`(${offsetLabel(z, now)}) ${cityOf(z)}`}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost" onClick={useDevice}>{t("Энэ төхөөрөмжийн бүсийг авах", "Use this device's zone")}</button>
        <span className="flex items-center gap-2 text-sm text-zinc-400"><span aria-hidden className="h-[13px] w-[13px] rounded-full border-[3px] border-zinc-50 bg-amber-400" />{t("Одоо", "Now")} <span className="font-semibold text-zinc-100 tabular-nums">{time(now)}</span></span>
      </div>
      <Feedback state={state} />
      <noscript><button className="btn">{t("Хадгалах", "Save")}</button></noscript>
    </form>
  );
}

export function SignalPrefsForm({ paused, muted, news = false }: { paused: boolean; muted: string[]; news?: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSignalPrefsAction, {});
  const setups: [string, string][] = [["asian-breakout", t("Азийн хүрээний breakout", "Asian range breakout")], ["ny-open-breakout", t("Нью-Йоркийн нээлтийн breakout", "New York opening breakout")], ["ny-late-breakout", t("Нью-Йоркийн хоёр дахь цагийн breakout", "New York second-hour breakout")]];
  const row = "flex min-h-11 cursor-pointer items-center gap-3 text-sm text-zinc-200";
  return (
    <form action={action} className="space-y-3">
      <fieldset>
        <legend className="label">{t("Аль setup-ийн дохиог авах", "Which setups to hear about")}</legend>
        {setups.map(([id, name]) => (
          <label key={id} className={row}><input type="checkbox" name="setup" value={id} defaultChecked={!muted.includes(id)} className="h-5 w-5 accent-amber-500" />{name}</label>
        ))}
      </fieldset>
      <label className={row}><input type="checkbox" name="news" defaultChecked={news} className="h-5 w-5 accent-amber-500" />{t("Чухал мэдээ гарахаас 30 минутын өмнө сануулах", "Warn me 30 minutes before an important release")}</label>
      <label className={`${row} border-t border-zinc-800 pt-2`}><input type="checkbox" name="paused" defaultChecked={paused} className="h-5 w-5 accent-amber-500" />{t("Бүх дохиог түр зогсоох (холбоос хэвээр үлдэнэ)", "Pause all signals (Telegram stays linked)")}</label>
      <Feedback state={state} />
      <button className="btn" disabled={pending}>{t("Хадгалах", "Save")}</button>
    </form>
  );
}

/** `activeUntil` is the end of a running paid plan, already formatted for the reader; while it is set the account
 *  cannot be deleted, so the form is not shown. */
export function DeleteAccountForm({ isAdmin, activeUntil = null }: { isAdmin: boolean; activeUntil?: string | null }) {
  const t = useT();
  const [state, action, pending] = useActionState<SettingsState, FormData>(deleteAccountAction, {});
  return (
    <section className="card border-red-500/50">
      <h2 className="card-title text-red-300">{t("Бүртгэл устгах", "Delete account")}</h2>
      <p className="max-w-prose text-sm leading-relaxed text-zinc-300">{t("Бүртгэл, арилжааны журнал, роботын тохиргоо, token, роботын арилжааны түүх бүрмөсөн устана. Буцааж сэргээх боломжгүй. MT5 дээрх данс, арилжаанд хүрэхгүй.", "Your account, trade journal, robot settings, token and the robot's trade history are removed for good. It cannot be undone. Your MT5 account and its trades are not touched.")}</p>
      {isAdmin ? (
        <p className="mt-3 text-sm text-zinc-500">{t("Админ бүртгэлийг устгах боломжгүй.", "An admin account cannot be deleted.")}</p>
      ) : activeUntil ? (
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-zinc-400">{t(`Таны багц ${activeUntil} хүртэл идэвхтэй тул бүртгэлээ одоо устгах боломжгүй. Багцын хугацаа дууссаны дараа энд устгаж болно.`, `Your plan is active until ${activeUntil}, so the account cannot be deleted now. You can delete it here once the plan ends.`)}</p>
      ) : (
        <form action={action} className="mt-3 flex max-w-sm flex-col gap-3">
          <div><label className="label" htmlFor="deletePassword">{t("Нууц үг", "Password")}</label><input className="input" id="deletePassword" name="password" type="password" required autoComplete="current-password" /></div>
          <Feedback state={state} />
          <button className="btn-ghost border-red-500/60 text-red-300" disabled={pending}>{t("Бүртгэлээ устгах", "Delete my account")}</button>
        </form>
      )}
    </section>
  );
}
