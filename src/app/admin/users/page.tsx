import { desc, ilike } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { hasAccess } from "@/lib/access";
import { grantAction, revokeAction } from "@/lib/actions/admin";
import { formatUbDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const term = q.trim().replace(/[%_\\]/g, "\\$&");
  const users = await db.select().from(schema.users).where(term ? ilike(schema.users.email, `%${term}%`) : undefined).orderBy(desc(schema.users.createdAt)).limit(200);
  const now = new Date();
  return (
    <div className="space-y-4">
      <h1 className="page-title">Хэрэглэгчид</h1>
      <form className="flex max-w-md gap-2">
        <input className="input" name="q" defaultValue={q} placeholder="Имэйлээр хайх" aria-label="Имэйлээр хайх" />
        <button className="btn-ghost">Хайх</button>
      </form>
      {users.length === 0 ? <div className="card text-zinc-400">Хэрэглэгч олдсонгүй.</div> : (
        <>
        <ul className="space-y-3 md:hidden">
          {users.map((u) => {
            const active = hasAccess(u, now);
            return (
              <li key={u.id} className="card">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{u.name}{u.role === "ADMIN" && <span className="ml-2 text-xs text-amber-400">админ</span>}</span>
                  <span className={`shrink-0 text-sm ${active ? "text-emerald-400" : "text-zinc-500"}`}>{active ? "Идэвхтэй" : "Идэвхгүй"}</span>
                </div>
                <div className="truncate text-sm text-zinc-400">{u.email}</div>
                <div className="mt-1 font-mono text-xs text-zinc-500">Эрх дуусах: {u.role === "ADMIN" ? "хугацаагүй" : u.accessUntil ? formatUbDateTime(u.accessUntil) : "—"}</div>
                {u.role !== "ADMIN" && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[30, 90].map((d) => (
                      <form key={d} action={grantAction}><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="days" value={d} /><button className="btn-ghost w-full">+{d} хоног</button></form>
                    ))}
                    <form action={revokeAction}><input type="hidden" name="userId" value={u.id} /><button className="btn-ghost w-full text-red-400">Эрх хаах</button></form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="table-card hidden md:block">
          <table className="w-full">
            <thead><tr>{["Нэр", "Имэйл", "Бүртгүүлсэн", "Эрх дуусах", "Төлөв", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {users.map((u) => {
                const active = hasAccess(u, now);
                return (
                  <tr key={u.id} className="border-t border-zinc-800">
                    <td className="td">{u.name}{u.role === "ADMIN" && <span className="ml-2 text-xs text-amber-400">админ</span>}</td>
                    <td className="td">{u.email}</td>
                    <td className="td whitespace-nowrap font-mono text-zinc-400">{formatUbDateTime(u.createdAt)}</td>
                    <td className="td whitespace-nowrap font-mono">{u.role === "ADMIN" ? "хугацаагүй" : u.accessUntil ? formatUbDateTime(u.accessUntil) : "—"}</td>
                    <td className={`td ${active ? "text-emerald-400" : "text-zinc-500"}`}>{active ? "Идэвхтэй" : "Идэвхгүй"}</td>
                    <td className="td whitespace-nowrap">
                      {u.role !== "ADMIN" && (
                        <div className="flex gap-2">
                          {[30, 90].map((d) => (
                            <form key={d} action={grantAction}><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="days" value={d} /><button className="btn-ghost">+{d} хоног</button></form>
                          ))}
                          <form action={revokeAction}><input type="hidden" name="userId" value={u.id} /><button className="btn-ghost text-red-400">Эрх хаах</button></form>
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
