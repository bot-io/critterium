import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores (must be in its own config object)
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'android/**',
      '**/coverage/**',
      '*.apk',
      '**/*.config.{js,ts,mjs,cjs}',
      'eslint.config.js',
    ],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript rules
  ...tseslint.configs.recommended,

  // Prettier compatibility (turn off conflicting rules)
  prettierConfig,

  // Project-specific rules for source files
  {
    files: ['packages/*/src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        performance: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        File: 'readonly',
        HTMLElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLDivElement: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        PointerEvent: 'readonly',
        TouchEvent: 'readonly',
        WheelEvent: 'readonly',
        KeyboardEvent: 'readonly',
        FileReader: 'readonly',
        indexedDB: 'readonly',
        ResizeObserver: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      // App legitimately uses console.log for user-visible output
      'no-console': 'off',
    },
  },

  // Relaxed rules for test files
  {
    files: ['packages/**/*.test.ts', 'packages/**/*.spec.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Vitest globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        // Browser globals used in jsdom tests
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        HTMLElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        PointerEvent: 'readonly',
        navigator: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        indexedDB: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      // Unused imports/vars are common in tests (type imports for assertions)
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
