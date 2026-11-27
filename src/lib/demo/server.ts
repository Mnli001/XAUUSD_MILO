import { getLiveTick } from "../feed";
import { demoMissions, demoState } from "./demo";
import { accountView, orderView, type DemoView } from "./view";
import type { Price } from "./engine";

/** The live bid and ask, or null when the feed is down (the market is closed or the price is not coming in). */
export async function livePrice(now: Date): Promise<(Price & { at: number }) | null> {
  const tick = await getLiveTick(now);
  return tick ? { bid: tick.bid, ask: tick.ask, at: tick.time.getTime() } : null;
}

export async function demoView(userId: string, accountId: string, now = new Date()): Promise<DemoView | null> {
  const price = await livePrice(now);
  const s = await demoState(userId, accountId, price, now);
  if (!s) return null;
  return {
    account: accountView(s.account), state: s.state, positions: s.positions.map(orderView), pending: s.pending.map(orderView), history: s.history.map(orderView),
    cash: s.cash.map((c) => ({ kind: c.kind, amount: c.amount, balanceAfter: c.balanceAfter, at: c.at.getTime() })),
    missions: await demoMissions(accountId, s.account.startBalance), price,
  };
}
