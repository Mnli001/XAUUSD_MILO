/** What a plan costs and how long it opens the site. Amounts in tögrög. */
export type PlanId = "PLUS" | "PRO" | "MAX";

export const PLANS: Record<PlanId, { name: string; days: number; amount: number }> = {
  PLUS: { name: "Plus", days: 30, amount: 50000 },
  PRO: { name: "Pro", days: 180, amount: 150000 },
  MAX: { name: "Max", days: 365, amount: 300000 },
};
export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && Object.hasOwn(PLANS, v);

/** The new end of access: `days` added to whichever is later, now or the current end, so renewing early loses nothing. */
export function extendAccess(current: Date | null, now: Date, days: number): Date {
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + days * 864e5);
}

/** "50,000₮" */
export const tugrik = (amount: number) => `${amount.toLocaleString("en-US")}₮`;
