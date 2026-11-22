import { getSessionUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { tradesCsv } from "@/lib/export";
import { getViewer } from "@/lib/prefs.server";
import { listTrades } from "@/lib/trades";

export const dynamic = "force-dynamic";

/** The signed-in user's own journal as a CSV download. */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !hasAccess(user, new Date())) return new Response("Unauthorized", { status: 401 });
  const v = await getViewer();
  const trades = (await listTrades(user.id)).reverse(); // oldest first, the way a ledger reads
  return new Response(tradesCsv(trades, v), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="xau-journal-${v.date(new Date())}.csv"`,
      "cache-control": "no-store",
    },
  });
}
