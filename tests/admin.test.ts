import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/lib/db";
import { grantAccess, revokeAccess, saveEvent, deleteEvent, changePassword } from "@/lib/admin";
import { verifyCredentials } from "@/lib/users";
import type { User } from "@/lib/db/schema";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";

let admin: User, u: User;
const validEvent = { type: "FOMC", title: "ХНС-ийн бодлогын хүү", ubDate: "2026-12-10", ubTime: "03:00", impact: "HIGH" };
const getUser = async (id: string) => (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0];

beforeEach(async () => { await resetDb(); admin = await makeUser("admin@x.mn", "ADMIN"); u = await makeUser("u@x.mn"); });

test("grantAccess extends from the later of now and current expiry", async () => {
  const now = new Date("2026-11-20T00:00:00Z");
  expect((await grantAccess(admin.id, u.id, 30, now)).toISOString()).toBe("2026-12-20T00:00:00.000Z");
  expect((await grantAccess(admin.id, u.id, 30, now)).toISOString()).toBe("2027-01-19T00:00:00.000Z");
  await db.update(schema.users).set({ accessUntil: new Date("2026-01-01T00:00:00Z") }).where(eq(schema.users.id, u.id));
  expect((await grantAccess(admin.id, u.id, 30, now)).toISOString()).toBe("2026-12-20T00:00:00.000Z"); // expired: from now
});
test("revokeAccess clears expiry", async () => {
  await grantAccess(admin.id, u.id, 30, new Date());
  await revokeAccess(admin.id, u.id);
  expect((await getUser(u.id)).accessUntil).toBeNull();
});
test("non-admins cannot call admin functions", async () => {
  await expect(grantAccess(u.id, u.id, 30, new Date())).rejects.toThrow();
  await expect(revokeAccess(u.id, admin.id)).rejects.toThrow();
  await expect(saveEvent(u.id, null, validEvent)).rejects.toThrow();
  await expect(deleteEvent(u.id, "x")).rejects.toThrow();
  expect((await getUser(u.id)).accessUntil).toBeNull();
});
test("admin-entered event is stored in UTC with source admin, and can be edited and deleted", async () => {
  expect(await saveEvent(admin.id, null, validEvent)).toEqual({});
  const [e] = await db.select().from(schema.economicEvents);
  expect(e.time.toISOString()).toBe("2026-12-09T19:00:00.000Z");
  expect(e).toMatchObject({ source: "admin", country: "АНУ", forecast: null });
  expect(await saveEvent(admin.id, e.id, { ...validEvent, forecast: "4.25%", actual: "" })).toEqual({});
  expect((await db.select().from(schema.economicEvents))[0]).toMatchObject({ forecast: "4.25%", actual: null });
  expect((await saveEvent(admin.id, null, validEvent)).error).toBeTruthy(); // same type and time
  expect((await saveEvent(admin.id, null, { ...validEvent, ubDate: "not-a-date" })).error).toBeTruthy();
  await deleteEvent(admin.id, e.id);
  expect(await db.select().from(schema.economicEvents)).toHaveLength(0);
});
test("changePassword needs the current password", async () => {
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash("old-password", 4) }).where(eq(schema.users.id, u.id));
  expect((await changePassword(u.id, "wrong", "new-password1")).error).toBe("Одоогийн нууц үг буруу байна");
  expect((await changePassword(u.id, "old-password", "short")).error).toBeTruthy();
  expect(await changePassword(u.id, "old-password", "new-password1")).toEqual({});
  expect(await verifyCredentials("u@x.mn", "new-password1")).not.toBeNull();
  expect(await verifyCredentials("u@x.mn", "old-password")).toBeNull();
});
