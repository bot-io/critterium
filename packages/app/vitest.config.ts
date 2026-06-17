import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    // Heavy preset-simulation diagnostics (~4-7 min each) — run on demand via:
    //   npx vitest run packages/app/src/preset-stability.test.ts
    //   npx vitest run packages/app/src/stability-analysis.test.ts
    exclude: ['src/**/preset-stability.test.ts', 'src/**/stability-analysis.test.ts'],
  },
});
