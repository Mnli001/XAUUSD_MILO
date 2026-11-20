export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ENABLE_SCHEDULER !== "1") return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
