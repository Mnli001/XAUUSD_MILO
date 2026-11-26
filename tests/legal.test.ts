import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { LEGAL_VERSION, needsConsent, recordConsent } from "@/lib/legal";

beforeEach(async () => { await resetDb(); });

describe("consent", () => {
  it("someone who has not accepted the current version needs to", async () => {
    expect(needsConsent({ consentVersion: null })).toBe(true);
    expect(needsConsent({ consentVersion: "2000-01-01" })).toBe(true);
    expect(needsConsent({ consentVersion: LEGAL_VERSION })).toBe(false);
  });
  it("recording consent stores the time and the version", async () => {
    const u = await makeUser("a@x.mn");
    const at = new Date("2026-11-26T10:00:00Z");
    await recordConsent(u.id, at);
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(row).toMatchObject({ consentAt: at, consentVersion: LEGAL_VERSION });
  });
});
