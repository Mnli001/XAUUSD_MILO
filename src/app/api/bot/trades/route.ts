import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listAccounts } from "@/lib/bot/liveDb";
import { pickAccount } from "@/lib/botPerformance";
import { botChartData } from "@/lib/botChart";

export const dynamic = "force-dynamic";

/** The signed-in user's robot trades for the chart and its history list: their own data, plan or not. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const asked = new URL(req.url).searchParams.get("account") ?? undefined;
  const accounts = await listAccounts(user.id, new Date());
  const login = pickAccount(accounts, asked);
  const data = login ? await botChartData(user.id, login) : { trades: [], open: [] };
  return NextResponse.json({ account: login, accounts: accounts.map((a) => ({ login: a.login, label: a.label, mode: a.mode })), ...data }, { headers: { "cache-control": "no-store" } });
}
