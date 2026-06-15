import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest configuration (S3).
 *
 * Tests run in the Node environment (the agent + tools are server-side). The
 * `@/` alias mirrors tsconfig so test imports match app imports.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
    },
  },
});
