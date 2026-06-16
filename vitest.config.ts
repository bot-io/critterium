import { defineConfig } from 'vitest/config';

/**
 * Root-level Vitest configuration.
 *
 * Only affects `vitest` invoked from the repo root (e.g. the worker
 * health-check command `npx vitest run --exclude ...`). Per-package `npm test`
 * runs execute `vitest run` with the workspace directory as cwd, so each
 * package uses its own vitest.config.ts (core / render / app) — this file does
 * not interfere with that path.
 *
 * The two heavy preset-simulation diagnostics (~4 min each) are excluded from
 * default runs so the root health check is fast (~30s). Run them on demand:
 *   npx vitest run packages/app/src/preset-stability.test.ts
 *   npx vitest run packages/app/src/stability-analysis.test.ts
 */
export default defineConfig({
  test: {
    globals: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/preset-stability.test.ts',
      '**/stability-analysis.test.ts',
    ],
  },
});
