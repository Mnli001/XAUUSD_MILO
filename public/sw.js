/* XAU Analytics service worker: shows push notifications and opens the page a notification points to.
   It does not cache pages; the site always loads fresh. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = typeof data.title === "string" && data.title ? data.title : "XAU Analytics";
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    data: { url: typeof data.url === "string" ? data.url : "/today" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // only ever open a page of this site
  const target = new URL((event.notification.data && event.notification.data.url) || "/today", self.location.origin);
  const url = target.origin === self.location.origin ? target.href : new URL("/today", self.location.origin).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of open) {
      if (new URL(c.url).origin === self.location.origin && "focus" in c) {
        try { await c.navigate(url); } catch { /* an uncontrolled tab cannot be navigated; focusing it is enough */ }
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
