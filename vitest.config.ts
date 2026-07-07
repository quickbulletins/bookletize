import { defineConfig } from "vitest/config";

// Keep agent/editor workspace clones (e.g. .claude/worktrees/*) out of the
// suite — they carry full repo copies whose tests would double-count or fail
// against divergent branches. node_modules/dist mirror vitest's defaults.
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
  },
});
