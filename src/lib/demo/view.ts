import type { DemoAccount, DemoOrder } from "../db/schema";
import type { AccountState } from "./engine";
import type { MissionId } from "./demo";

/** What the terminal receives as JSON: numbers as they are, times as epoch milliseconds. */
export type DemoOrderView = {
  id: string; side: "BUY" | "SELL"; type: "MARKET" | "LIMIT" | "STOP"; status: string; lots: number; price: number | null; openPrice: number | null;
  openedAt: number | null; sl: number | null; tp: number | null; closePrice: number | null; closedAt: number | null; closeReason: string | null;
  profit: number | null; note: string | null; createdAt: number;
};
export type DemoAccountView = { id: string; name: string; leverage: number; balance: number; startBalance: number; beginner: boolean; createdAt: number };
export type DemoCashView = { kind: string; amount: number; balanceAfter: number; at: number };
export type DemoView = {
  account: DemoAccountView; state: AccountState; positions: DemoOrderView[]; pending: DemoOrderView[]; history: DemoOrderView[]; cash: DemoCashView[];
  missions: { id: MissionId; count: number; goal: number }[];
  price: { bid: number; ask: number; at: number } | null;
};

const ms = (d: Date | null) => (d ? d.getTime() : null);
export const orderView = (r: DemoOrder): DemoOrderView => ({
  id: r.id, side: r.side === "SELL" ? "SELL" : "BUY", type: r.type === "LIMIT" ? "LIMIT" : r.type === "STOP" ? "STOP" : "MARKET", status: r.status, lots: r.lots,
  price: r.price, openPrice: r.openPrice, openedAt: ms(r.openedAt), sl: r.sl, tp: r.tp, closePrice: r.closePrice, closedAt: ms(r.closedAt), closeReason: r.closeReason,
  profit: r.profit, note: r.note, createdAt: r.createdAt.getTime(),
});
export const accountView = (a: DemoAccount): DemoAccountView => ({ id: a.id, name: a.name, leverage: a.leverage, balance: a.balance, startBalance: a.startBalance, beginner: a.beginner, createdAt: a.createdAt.getTime() });
