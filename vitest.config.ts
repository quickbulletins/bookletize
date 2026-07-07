import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Scope collection to the repo's own suite: the default glob (**/*.test.ts)
    // recurses into embedded checkouts under .claude/worktrees/ and runs stale
    // copies of these same tests.
    include: ['test/**/*.test.ts'],
  },
})
