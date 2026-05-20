import tseslint from 'typescript-eslint';

const noopRule = {
  meta: {
    type: 'problem',
    schema: [],
  },
  create() {
    return {};
  },
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'build/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '*.tsbuildinfo',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts', '*.config.ts'],
    languageOptions: {
      globals: {
        AbortController: 'readonly',
        console: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        window: 'readonly',
      },
    },
    plugins: {
      'react-hooks': {
        rules: {
          'exhaustive-deps': noopRule,
        },
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-undef': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  // E2E-only rules — keep the world-class patterns from eroding.
  {
    files: ['e2e/**/*.ts'],
    rules: {
      // Runtime `test`/`expect` MUST come from `./fixtures/base`. Type-only
      // imports from `@playwright/test` (Page, Locator, TestInfo) are fine.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              importNames: ['test', 'expect'],
              message:
                "Import `test` and `expect` from './fixtures/base' so every spec gets the shared auth fixture and consistent mocking.",
            },
          ],
        },
      ],
    },
  },
  // Helpers/fixtures/pages themselves may import from @playwright/test
  // (that's how the world-class base is built).
  {
    files: ['e2e/fixtures/**/*.ts', 'e2e/pages/**/*.ts', 'e2e/helpers/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
);
