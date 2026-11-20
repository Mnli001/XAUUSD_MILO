import type { Role } from "./db/schema";

export function hasAccess(user: { role: Role; accessUntil: Date | null }, now: Date): boolean {
  if (user.role === "ADMIN") return true;
  return user.accessUntil !== null && user.accessUntil.getTime() > now.getTime();
}
