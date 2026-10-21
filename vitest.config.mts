import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: { provider: "v8", include: ["lib/vault/**", "lib/db/**", "lib/learner/**", "lib/flashcards.ts"], exclude: ["lib/vault/active.ts", "lib/vault/render.ts", "lib/learner/service.ts"] },
  },
});
