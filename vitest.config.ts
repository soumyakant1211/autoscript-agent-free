import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" throws outside Next's server bundle; it's a no-op for unit tests.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    env: { DATABASE_URL: "postgres://unused@localhost:1/unused", BETTER_AUTH_SECRET: "unit-test-secret-unit-test-secret-1234" },
    coverage: { provider: "v8", include: ["src/lib/**"], reporter: ["text", "html"] },
  },
});
