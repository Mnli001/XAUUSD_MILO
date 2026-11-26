import { getSessionUser } from "@/lib/auth";
import { getAvatar } from "@/lib/avatar";

export const dynamic = "force-dynamic";

/**
 * The signed-in user's own profile picture. Private: only the owner's session gets it. The address carries a version
 * (?v=…), so the browser may keep a copy and a new picture still shows at once.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const a = await getAvatar(user.id);
  if (!a) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(a.image), {
    headers: {
      "content-type": a.mime,
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'",
    },
  });
}
