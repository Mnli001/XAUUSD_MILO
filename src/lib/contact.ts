export type AdminContact = { text: string; url: string | null };

/**
 * How someone reaches the admin (help with a payment, a question), from the ADMIN_CONTACT (any text: a phone,
 * a Telegram name) and ADMIN_CONTACT_URL (a t.me or m.me link) settings. Only http(s) links are kept.
 */
export function adminContact(env: { ADMIN_CONTACT?: string; ADMIN_CONTACT_URL?: string }): AdminContact | null {
  const text = env.ADMIN_CONTACT?.trim() ?? "";
  const raw = env.ADMIN_CONTACT_URL?.trim() ?? "";
  const url = /^https?:\/\//i.test(raw) ? raw : null;
  if (!text && !url) return null;
  return { text: text || (url as string), url };
}

export const siteAdminContact = () => adminContact({ ADMIN_CONTACT: process.env.ADMIN_CONTACT, ADMIN_CONTACT_URL: process.env.ADMIN_CONTACT_URL });
