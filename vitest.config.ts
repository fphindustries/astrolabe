import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    // `rules` is the package that gets real unit tests (CLAUDE.md, Testing).
    // Coverage thresholds arrive with task 1.9, once there is something to cover.
  },
});
