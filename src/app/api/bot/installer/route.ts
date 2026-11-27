import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { rotateToken } from "@/lib/bot/liveDb";
import { INSTALLER_FILENAME, installerBat } from "@/lib/bot/installer";
import { siteUrl } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * The one-click Windows installer (XauBot-Setup.bat) for a member. Every download makes a NEW robot token, so the
 * previous one stops working; the Bot page says so on the button. The site's address comes from APP_URL (siteUrl),
 * never from the request's headers, so the file can only ever point the robot at this site.
 */
export async function GET(req: Request) {
  // Fetching this changes the member's token: a request started by another site (a link or a form there) is refused.
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await getSessionUser();
  if (!user || !hasAccess(user, new Date())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const origin = siteUrl();
  if (!origin) return NextResponse.json({ error: "the site address (APP_URL) is not set" }, { status: 503 });
  const token = await rotateToken(user.id);
  const body = installerBat({ origin, syncUrl: `${origin}/api/bot/sync`, token });
  return new NextResponse(body, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${INSTALLER_FILENAME}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
