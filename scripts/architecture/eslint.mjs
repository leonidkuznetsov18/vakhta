import boundaries from 'eslint-plugin-boundaries';

const root = 'apps/admin-web/src';
const layered = (type) => ({
  type,
  pattern: `${root}/${type}/*`,
  partialMatch: false,
  capture: ['slice'],
  stopMatching: true,
});
const forbidden = (from, types) => ({
  from: { element: { type: from } },
  disallow: { to: { element: { types: { anyOf: types } } } },
});
export const architectureConfig = {
  files: [
    `${root}/features/{employee-import,employee-profile,audit-filters}/**/*.{ts,tsx}`,
    `${root}/entities/employee/**/*.{ts,tsx}`,
    `${root}/shared/{api,config}/**/*.{ts,tsx}`,
  ],
  ignores: ['**/*.test.*', '**/*.fixture.*'],
  plugins: { boundaries },
  settings: {
    'import/resolver': { typescript: { project: 'apps/admin-web/tsconfig.json' } },
    'boundaries/elements': [
      ...['features', 'entities', 'widgets', 'pages'].map(layered),
      { type: 'shared', pattern: `${root}/shared/*`, partialMatch: false, stopMatching: true },
      { type: 'app', pattern: `${root}/app`, partialMatch: false, stopMatching: true },
      // Existing root API, i18n and UI adapters are explicit incremental migration debt.
      { type: 'legacy', pattern: root, partialMatch: false },
    ],
  },
  rules: {
    'boundaries/dependencies': [
      'error',
      {
        default: 'allow',
        policies: [
          forbidden('features', ['features', 'widgets', 'pages', 'app']),
          forbidden('entities', ['entities', 'features', 'widgets', 'pages', 'app']),
          forbidden('shared', ['entities', 'features', 'widgets', 'pages', 'app', 'legacy']),
          {
            to: { element: { types: { anyOf: ['features', 'entities'] } } },
            disallow: { to: { element: { fileInternalPath: '!index.ts' } } },
          },
        ],
      },
    ],
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'react',
            importNames: ['useEffect', 'useLayoutEffect', 'useMemo', 'useRef', 'useCallback'],
            message: 'Use the owning model/Query/store or a maintained integration.',
          },
        ],
      },
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector:
          'MemberExpression[property.name=/^(useEffect|useLayoutEffect|useMemo|useRef|useCallback)$/]',
        message:
          'Application-owned lifecycle and memoization hooks are prohibited, including aliases.',
      },
      {
        selector: 'Property[key.name=/^(useEffect|useLayoutEffect|useMemo|useRef|useCallback)$/]',
        message: 'Do not bypass the hook policy with destructuring.',
      },
    ],
  },
};
