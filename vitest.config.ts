import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/xau_test",
      AUTH_SECRET: "test-secret",
      CRON_SECRET: "test-cron",
    },
  },
});
