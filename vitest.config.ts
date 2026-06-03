import { defineConfig } from "vitest/config";

// Vitest picks up everything matching its default include pattern, which
// recursively scans .claude/worktrees/* too — every worktree contains a
// checked-out copy of the codebase, so each test file gets run N times
// (once per worktree). Exclude them explicitly.
//
// `dist`, `node_modules` and similar are already in Vitest's default
// exclude list, but we restate `**/.claude/**` here to be explicit.
export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.claude/worktrees/**",
      "**/.claude/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
  },
});
