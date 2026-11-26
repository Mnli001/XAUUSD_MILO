import type { User } from "./db/schema";
import { hasAccess } from "./access";
import { wireConfig } from "./wire";
import { siteUrl } from "./telegram";
import { siteAdminContact } from "./contact";

/** What a page needs to decide what to hide and whether the plans can be bought yet. */
export function paywallFor(user: User, now = new Date()) {
  return { paid: hasAccess(user, now), payOn: !!wireConfig(process.env) && !!siteUrl(), contact: siteAdminContact() };
}
