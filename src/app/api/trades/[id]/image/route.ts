import { getSessionUser } from "@/lib/auth";
import { getTradeImage } from "@/lib/trades";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await params;
  const img = await getTradeImage(user.id, id);
  if (!img) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(img.bytes), { headers: { "content-type": img.mime, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
