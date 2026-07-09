import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    // .claude holds session worktrees (full repo copies) — without this their
    // test files get collected too and every suite runs N× times.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
});
