import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import {
  adjustDemoBalance, cancelDemoOrder, closeAllDemo, closeDemoPosition, deleteDemoAccount, modifyDemoOrder, openDemoAccount, placeDemoOrder, renameDemoAccount,
} from "@/lib/demo/demo";
import { demoView, livePrice } from "@/lib/demo/server";
import { accountView } from "@/lib/demo/view";

export const dynamic = "force-dynamic";

const price = z.number().positive().max(1_000_000).nullable().optional();
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), name: z.string().max(80), balance: z.number(), leverage: z.number().int(), beginner: z.boolean() }),
  z.object({ action: z.literal("order"), account: z.string(), side: z.enum(["BUY", "SELL"]), type: z.enum(["MARKET", "LIMIT", "STOP"]), lots: z.number(), price, sl: price, tp: price, note: z.string().max(600).nullable().optional() }),
  z.object({ action: z.literal("modify"), account: z.string(), id: z.string(), sl: price, tp: price, price }),
  z.object({ action: z.literal("close"), account: z.string(), id: z.string(), lots: z.number().optional() }),
  z.object({ action: z.literal("cancel"), account: z.string(), id: z.string() }),
  z.object({ action: z.literal("closeAll"), account: z.string() }),
  z.object({ action: z.literal("cash"), account: z.string(), kind: z.enum(["DEPOSIT", "WITHDRAW", "RESET"]), amount: z.number() }),
  z.object({ action: z.literal("settings"), account: z.string(), name: z.string().max(80), beginner: z.boolean() }),
  z.object({ action: z.literal("delete"), account: z.string() }),
]);

/** Every change to a demo account. Answers with the error code, or with the account as it is now. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad" }, { status: 400 });
  const b = parsed.data;
  const now = new Date();
  const p = await livePrice(now);
  let error: string | undefined;
  let info: Record<string, unknown> = {};
  switch (b.action) {
    case "open": {
      const r = await openDemoAccount(user.id, { name: b.name, balance: b.balance, leverage: b.leverage, beginner: b.beginner }, now);
      if (r.error) return NextResponse.json({ error: r.error }, { status: 422 });
      return NextResponse.json({ account: accountView(r.account!) });
    }
    case "order": error = (await placeDemoOrder(user.id, b.account, { side: b.side, type: b.type, lots: b.lots, price: b.price ?? null, sl: b.sl ?? null, tp: b.tp ?? null, note: b.note }, p, now)).error; break;
    case "modify": error = (await modifyDemoOrder(user.id, b.id, { sl: b.sl ?? null, tp: b.tp ?? null, price: b.price ?? null }, p)).error; break;
    case "close": { const r = await closeDemoPosition(user.id, b.id, p, now, b.lots); error = r.error; if (r.closed) info = { profit: r.closed.profit }; break; }
    case "cancel": if (!(await cancelDemoOrder(user.id, b.id))) error = "order"; break;
    case "closeAll": if (!p) error = "closed"; else info = { closed: await closeAllDemo(user.id, b.account, p, now) }; break;
    case "cash": error = (await adjustDemoBalance(user.id, b.account, b.kind, b.amount, p, now)).error; break;
    case "settings": if (!(await renameDemoAccount(user.id, b.account, b.name, b.beginner))) error = "name"; break;
    case "delete": return NextResponse.json({ deleted: await deleteDemoAccount(user.id, b.account) });
  }
  if (error) return NextResponse.json({ error }, { status: 422 });
  return NextResponse.json({ ...info, view: await demoView(user.id, b.account, now) });
}
