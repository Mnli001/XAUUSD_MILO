export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // People can now write to the bot before anyone has pressed a button on the site, so the bot must
  // already know where to send what it hears.
  const { ensureWebhook, siteUrl, telegramConfigured } = await import("./lib/telegram");
  const origin = siteUrl();
  if (telegramConfigured() && origin) {
    // Telegram is sometimes slow or rate-limited when the server starts. Keep trying, further apart each
    // time, until the webhook is in place; the bot cannot hear anyone before that.
    const attempt = (n: number) => {
      ensureWebhook(origin).then(() => console.log("[telegram] webhook set")).catch((e) => {
        const wait = Math.min(15 * 60_000, 60_000 * 2 ** Math.min(n, 4));
        console.error(`[telegram] webhook not set (attempt ${n + 1}), retrying in ${Math.round(wait / 60_000)} min:`, e instanceof Error ? e.message : e);
        setTimeout(() => attempt(n + 1), wait).unref?.();
      });
    };
    attempt(0);
  }
  if (process.env.ENABLE_SCHEDULER !== "1") return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
