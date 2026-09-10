import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    // `test-results/` is where the runners write; it is ignored by git for the same reason.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/test-results/**',
      'packages/db/drizzle/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
  {
    // NestJS DI читає типи конструктора з emitDecoratorMetadata: класи мають імпортуватись як значення.
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // The panel's rules of React, including the ones the compiler needs to be able to memoize a
    // component: no state written from an effect, no props or state mutated in place, no ref read
    // during a render. Reading data belongs to TanStack Query, screen state to a zustand store,
    // and what is left is derived while rendering — these rules are what keeps it that way.
    files: ['apps/admin-web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs['recommended-latest'].rules,
  },
  {
    // Скрипти k6 виконуються всередині k6, де __ENV є глобальним обʼєктом.
    files: ['infra/load/**/*.js'],
    languageOptions: { globals: { __ENV: 'readonly' } },
  },
  prettier,
);
