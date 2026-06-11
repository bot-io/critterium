import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepo = resolve(__dirname, '..', '..');

export default defineConfig({
  root: '.',
  resolve: {
    // Prevent Vite from reading package.json "exports" — aliases handle everything
    conditions: [],
    alias: [
      // Sub-path imports MUST come before the bare import (longest match first)
      { find: /^@critterium\/core\/ecosystem-world$/, replacement: resolve(monorepo, 'packages/core/src/ecosystem-world.ts') },
      { find: /^@critterium\/core\/ecosystem$/, replacement: resolve(monorepo, 'packages/core/src/ecosystem.ts') },
      { find: /^@critterium\/core\/eating$/, replacement: resolve(monorepo, 'packages/core/src/eating.ts') },
      { find: /^@critterium\/core\/lifecycle$/, replacement: resolve(monorepo, 'packages/core/src/lifecycle.ts') },
      { find: /^@critterium\/core\/interaction-rules$/, replacement: resolve(monorepo, 'packages/core/src/interaction-rules.ts') },
      { find: /^@critterium\/core$/, replacement: resolve(monorepo, 'packages/core/src/index.ts') },
      { find: /^@critterium\/render$/, replacement: resolve(monorepo, 'packages/render/src/index.ts') },
    ],
    dedupe: ['pixi.js'],
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 3000,
    open: true,
  },
});
