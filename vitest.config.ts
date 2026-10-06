import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: "server", include: ["server/**/*.test.ts"], environment: "node", pool: "vmThreads" },
      },
      {
        plugins: [react()],
        test: {
          name: "web",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          pool: "vmThreads",
          setupFiles: ["src/test/setup.ts"],
        },
      },
    ],
  },
});
