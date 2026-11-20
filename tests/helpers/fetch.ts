import { vi } from "vitest";

let lastUrl = "";
export function stubFetch(status: number, body: unknown) {
  vi.stubGlobal("fetch", async (url: string | URL) => {
    lastUrl = String(url);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
}
export const lastFetchUrl = () => lastUrl;
