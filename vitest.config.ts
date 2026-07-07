import { defineConfig } from "vitest/config";

// Keep agent/editor workspace clones (e.g. .claude/worktrees/*) out of the
// suite — they carry full repo copies whose tests would double-count or fail
// against divergent branches. Scoping include to the repo's own test/ dir
// (instead of mirroring vitest's default excludes) leaves those defaults
// intact and survives new kinds of embedded checkouts.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
