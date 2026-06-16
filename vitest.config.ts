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
    // next-auth (and other Next-aware deps) import "next/server" without an
    // extension and rely on Next's "react-server"/"node" export conditions.
    // Mirror them here so Vitest resolves the same module Next would at runtime.
    conditions: ["node", "import", "module", "default"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Inline Next-aware packages so Vitest transforms (and correctly resolves)
    // their internal extensionless imports like "next/server".
    server: {
      deps: {
        inline: ["next-auth", "@auth/core"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
    },
  },
});
