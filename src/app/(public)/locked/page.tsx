import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { logoutAction } from "@/lib/actions/session";

export const dynamic = "force-dynamic";

export default async function LockedPage() {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (hasAccess(u, new Date())) redirect("/today");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md space-y-4 text-center sm:p-6">
        <h1 className="page-title">Эрх идэвхгүй</h1>
        <p className="text-zinc-300">Таны эрх идэвхжээгүй байна. Админтай холбогдож эрхээ нээлгэнэ үү.</p>
        <p className="text-sm text-zinc-500">Бүртгэлтэй имэйл: {u.email}</p>
        <form action={logoutAction}><button className="btn-ghost">Гарах</button></form>
      </div>
    </main>
  );
}
