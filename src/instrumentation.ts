export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // People can now write to the bot before anyone has pressed a button on the site, so the bot must
  // already know where to send what it hears.
  const { ensureWebhook, siteUrl, telegramConfigured } = await import("./lib/telegram");
  const origin = siteUrl();
  if (telegramConfigured() && origin) ensureWebhook(origin).catch((e) => console.error("[telegram] webhook not set at start", e));
  if (process.env.ENABLE_SCHEDULER !== "1") return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
