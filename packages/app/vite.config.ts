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
  // Pixi.js v8 + @capacitor/core use destructuring patterns that esbuild cannot
  // down-level to the default optimizeDeps target (es2020/chrome87). Without
  // this override, the dev server crashes during dependency pre-bundling with
  // "Transforming destructuring to the configured target environment is not
  // supported yet" → ERR_CONNECTION_REFUSED → all e2e tests fail.
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
  esbuild: {
    target: 'es2022',
  },
  server: {
    port: 3000,
  },
});
