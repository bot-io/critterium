import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepo = resolve(__dirname, '..', '..');

export default defineConfig({
  root: '.',
  resolve: {
    alias: [
      { find: '@critterium/core', replacement: resolve(monorepo, 'packages/core/src/index.ts') },
      {
        find: '@critterium/render',
        replacement: resolve(monorepo, 'packages/render/src/index.ts'),
      },
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
  },
});
