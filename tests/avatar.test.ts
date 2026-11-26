import { describe, it, expect, beforeEach } from "vitest";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { AVATAR_MAX_BYTES, avatarUrl, checkAvatar, deleteAvatar, getAvatar, saveAvatar, sniffImage } from "@/lib/avatar";

const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 9, 9]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe("what a profile picture may be", () => {
  it("recognises WebP, JPEG and PNG by their bytes and nothing else", () => {
    expect([sniffImage(webp), sniffImage(jpeg), sniffImage(png)]).toEqual(["image/webp", "image/jpeg", "image/png"]);
    expect(sniffImage(svg)).toBeNull();
    expect(sniffImage(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
  });

  it("refuses empty, oversized and non-image uploads", () => {
    expect(checkAvatar(new Uint8Array())).toEqual({ ok: false, error: "EMPTY" });
    const big = new Uint8Array(AVATAR_MAX_BYTES + 1); big.set(jpeg);
    expect(checkAvatar(big)).toEqual({ ok: false, error: "TOO_BIG" });
    expect(checkAvatar(svg)).toEqual({ ok: false, error: "NOT_IMAGE" });
    expect(checkAvatar(jpeg)).toEqual({ ok: true, mime: "image/jpeg" });
  });
});

describe("keeping a picture", () => {
  beforeEach(resetDb);

  it("saves, replaces and removes one picture per user, with a versioned address", async () => {
    const u = await makeUser("pic@x.mn");
    expect(await avatarUrl(u.id)).toBeNull();
    await saveAvatar(u.id, jpeg, "image/jpeg", new Date("2026-11-27T00:00:00Z"));
    expect(await avatarUrl(u.id)).toBe(`/api/avatar?v=${Date.parse("2026-11-27T00:00:00Z")}`);
    await saveAvatar(u.id, webp, "image/webp", new Date("2026-11-27T01:00:00Z"));
    const a = await getAvatar(u.id);
    expect(a?.mime).toBe("image/webp");
    expect(new Uint8Array(a!.image)).toEqual(webp);
    expect(await avatarUrl(u.id)).toBe(`/api/avatar?v=${Date.parse("2026-11-27T01:00:00Z")}`);
    expect(await db.select().from(schema.userAvatars)).toHaveLength(1);
    await deleteAvatar(u.id);
    expect(await getAvatar(u.id)).toBeNull();
  });

  it("goes with the account when the account is deleted", async () => {
    const u = await makeUser("gone@x.mn");
    await saveAvatar(u.id, png, "image/png");
    await db.delete(schema.users);
    expect(await db.select().from(schema.userAvatars)).toHaveLength(0);
  });
});
