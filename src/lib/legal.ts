import { eq } from "drizzle-orm";
import { db, schema } from "./db";

/**
 * The date of the current privacy policy and terms. Change it when either changes materially:
 * everyone is then asked to accept again (the banner in the app).
 */
export const LEGAL_VERSION = "2026-11-26";

export const needsConsent = (u: { consentVersion: string | null }) => u.consentVersion !== LEGAL_VERSION;

export async function recordConsent(userId: string, at: Date = new Date()): Promise<void> {
  await db.update(schema.users).set({ consentAt: at, consentVersion: LEGAL_VERSION }).where(eq(schema.users.id, userId));
}

/** Who runs the site, for the legal pages: LEGAL_NAME (a company or a person's name), else the brand. */
export const legalName = () => process.env.LEGAL_NAME?.trim() || "XAU Analytics";
