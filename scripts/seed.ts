/** Creates the admin account from ADMIN_EMAIL / ADMIN_PASSWORD: npm run seed */
import { eq } from "drizzle-orm";
import { db, schema, closeDb } from "../src/lib/db";
import { createUser, findUserByEmail, normaliseEmail } from "../src/lib/users";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("ADMIN_EMAIL, ADMIN_PASSWORD тохируулна уу");
  if (await findUserByEmail(email)) {
    await db.update(schema.users).set({ role: "ADMIN" }).where(eq(schema.users.email, normaliseEmail(email)));
    console.log(`${email} аль хэдийн бүртгэлтэй — ADMIN эрхтэй болголоо`);
  } else {
    const r = await createUser({ name: "Админ", email, password }, "ADMIN");
    if (r.error) throw new Error(r.error);
    console.log(`Админ үүслээ: ${email}`);
  }
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
