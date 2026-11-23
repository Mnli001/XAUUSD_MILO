import { desc, ilike } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { hasAccess } from "@/lib/access";
import { grantAction, revokeAction } from "@/lib/actions/admin";
import { formatUbDateTime } from "@/lib/time";
import { getT } from "@/lib/prefs.server";
import { Station } from "@/components/Timetable";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const t = await getT();
  const { q = "" } = await searchParams;
  const term = q.trim().replace(/[%_\\]/g, "\\$&");
  const users = await db.select().from(schema.users).where(term ? ilike(schema.users.email, `%${term}%`) : undefined).orderBy(desc(schema.users.createdAt)).limit(200);
  const now = new Date();
  const status = (active: boolean) => (
    <span className={`inline-flex items-center gap-2 text-sm whitespace-nowrap ${active ? "font-medium text-emerald-400" : "text-zinc-500"}`}>
      <Station tone={active ? "on" : "off"} />{active ? t("Идэвхтэй", "Active") : t("Идэвхгүй", "Inactive")}
    </span>
  );
  const adminTag = <span className="ml-2 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-xs font-semibold text-amber-300">{t("админ", "admin")}</span>;
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Хэрэглэгчид", "Users")}</h1>
        <p className="page-lede">{t("Шинэ хэрэглэгчийн эрхийг энд гараар нээнэ. Цаг нь УБ-аар.", "Open new users' access here by hand. Times are in UB time.")}</p>
      </div>
      <form className="flex max-w-md gap-2">
        <input className="input" name="q" defaultValue={q} placeholder={t("Имэйлээр хайх", "Search by email")} aria-label={t("Имэйлээр хайх", "Search by email")} />
        <button className="btn-ghost">{t("Хайх", "Search")}</button>
      </form>
      {users.length === 0 ? <div className="card text-sm text-zinc-400">{t("Хэрэглэгч олдсонгүй.", "No users found.")}</div> : (
        <>
        <ul className="table-card md:hidden">
          {users.map((u) => {
            const active = hasAccess(u, now);
            return (
              <li key={u.id} className="border-t border-zinc-800 px-4 py-3 first:border-t-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-semibold text-zinc-100">{u.name}{u.role === "ADMIN" && adminTag}</span>
                  {status(active)}
                </div>
                <div className="truncate text-sm text-zinc-400">{u.email}</div>
                <div className="mt-1 text-xs text-zinc-500">{t("Эрх дуусах:", "Access ends:")} <span className="text-zinc-300 tabular-nums">{u.role === "ADMIN" ? t("хугацаагүй", "no expiry") : u.accessUntil ? formatUbDateTime(u.accessUntil) : "—"}</span></div>
                {u.role !== "ADMIN" && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[30, 90].map((d) => (
                      <form key={d} action={grantAction}><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="days" value={d} /><button className="btn-ghost w-full tabular-nums">+{d} {t("хоног", "days")}</button></form>
                    ))}
                    <form action={revokeAction}><input type="hidden" name="userId" value={u.id} /><button className="btn-ghost w-full text-red-400">{t("Эрх хаах", "Revoke access")}</button></form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="table-card hidden md:block">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-zinc-800">{[t("Нэр", "Name"), t("Имэйл", "Email"), t("Бүртгүүлсэн", "Registered"), t("Эрх дуусах", "Access ends"), t("Төлөв", "Status"), ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {users.map((u) => {
                const active = hasAccess(u, now);
                return (
                  <tr key={u.id} className="border-t border-zinc-800/70 first:border-t-0">
                    <td className="td font-semibold text-zinc-100">{u.name}{u.role === "ADMIN" && adminTag}</td>
                    <td className="td text-zinc-300">{u.email}</td>
                    <td className="td whitespace-nowrap text-zinc-400 tabular-nums">{formatUbDateTime(u.createdAt)}</td>
                    <td className="td whitespace-nowrap text-zinc-100 tabular-nums">{u.role === "ADMIN" ? t("хугацаагүй", "no expiry") : u.accessUntil ? formatUbDateTime(u.accessUntil) : "—"}</td>
                    <td className="td">{status(active)}</td>
                    <td className="td whitespace-nowrap">
                      {u.role !== "ADMIN" && (
                        <div className="flex justify-end gap-2">
                          {[30, 90].map((d) => (
                            <form key={d} action={grantAction}><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="days" value={d} /><button className="btn-ghost tabular-nums">+{d} {t("хоног", "days")}</button></form>
                          ))}
                          <form action={revokeAction}><input type="hidden" name="userId" value={u.id} /><button className="btn-ghost text-red-400">{t("Эрх хаах", "Revoke access")}</button></form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
