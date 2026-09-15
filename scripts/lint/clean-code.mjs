import pluginQuery from '@tanstack/eslint-plugin-query';
import pluginRouter from '@tanstack/eslint-plugin-router';
import tseslint from 'typescript-eslint';

// Enforces AGENTS.md C8/C9 and docs/engineering/standards.md "Code clarity". Existing violations are
// recorded in eslint-suppressions.json; new code must pass. Fix a suppressed file, then prune.

const tsFiles = ['**/*.{ts,tsx}'];
const panelFiles = ['apps/admin-web/src/**/*.{ts,tsx}'];
const testFiles = ['**/*.{test,spec}.{ts,tsx}', '**/e2e/**', '**/test/**', '**/*.fixture.*'];
// Tooling files outside every tsconfig `include` cannot be type-checked.
const untypedFiles = ['**/*.config.ts', '.railway/**', 'apps/admin-web/e2e/**'];

const CODE = '/^[A-Z][A-Z0-9_]+$/';
const SCAN = '/^(find|findIndex|findLast|filter|includes|indexOf)$/';
const ITERATE = '/^(map|flatMap|forEach|filter|reduce|some|every|find|findIndex|sort)$/';
const LOOP =
  ':matches(ForStatement, ForOfStatement, ForInStatement, WhileStatement, DoWhileStatement)';
const scanCall = `CallExpression[callee.property.name=${SCAN}][callee.object.type!='ArrayExpression']`;

const restrictedSyntax = [
  {
    selector: 'TSEnumDeclaration',
    message: 'Use an enum-like `as const` object with a derived type instead of a TypeScript enum.',
  },
  {
    selector: `BinaryExpression[operator=/^[!=]==?$/] > Literal[value=${CODE}]`,
    message: 'Compare with the enum-like constant (ShiftState.OPEN), not a raw code string.',
  },
  {
    selector: `SwitchCase > Literal.test[value=${CODE}]`,
    message: 'Switch on the enum-like constant (case ShiftState.OPEN), not a raw code string.',
  },
  {
    selector: `${LOOP} ${scanCall}`,
    message: 'Linear scan inside a loop is O(n²). Build a Map/Set index once before the loop.',
  },
  {
    selector: `CallExpression[callee.property.name=${ITERATE}] > :function ${scanCall}`,
    message: 'Linear scan inside an iteration callback is O(n²). Build a Map/Set index once.',
  },
  {
    selector:
      ":function[params.length>3]:not(MethodDefinition[kind='constructor'] > FunctionExpression)",
    message: 'More than three parameters: accept one options object or split the function.',
  },
];

const panelSyntax = [
  {
    selector:
      "JSXAttribute[name.name='key'] > JSXExpressionContainer > Identifier[name=/^(i|idx|index)$/]",
    message: 'Key by record identity, not the array index.',
  },
  {
    selector:
      "CallExpression[callee.name=/^use[A-Za-z]*(Store|Shallow)$/] > ArrowFunctionExpression[body.type='Identifier']",
    message:
      'Select the fields the component reads (atomic selectors or useShallow), not the whole store.',
  },
  {
    selector:
      "CallExpression[callee.name=/^use(Params|Search)$/] Property[key.name='strict'] > Literal[value=false]",
    message: 'Read typed route data with { from: route.id } instead of strict: false.',
  },
  {
    selector: "Property[key.name='queryKey'] > ArrayExpression",
    message: 'Take query keys from the feature queryOptions/key factory, not an inline array.',
  },
];

const asErrors = (rules = {}) =>
  Object.fromEntries(Object.keys(rules).map((name) => [name, 'error']));

export const cleanCodeConfig = tseslint.config(
  {
    files: tsFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: new URL('../..', import.meta.url).pathname,
      },
    },
    rules: {
      'no-nested-ternary': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      'no-lonely-if': 'error',
      'no-param-reassign': 'error',
      'no-await-in-loop': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'max-depth': ['error', 2],
      'no-restricted-syntax': ['error', ...restrictedSyntax],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true, requireDefaultForNonUnion: true },
      ],
    },
  },
  {
    files: tsFiles,
    ignores: testFiles,
    rules: {
      complexity: ['error', 10],
      'max-nested-callbacks': ['error', 3],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
    },
  },
  ...[
    ...pluginQuery.configs['flat/recommended-strict'],
    ...pluginRouter.configs['flat/recommended'],
  ].map((config) => ({ ...config, files: panelFiles, rules: asErrors(config.rules) })),
  {
    files: panelFiles,
    rules: { 'no-restricted-syntax': ['error', ...restrictedSyntax, ...panelSyntax] },
  },
  {
    files: untypedFiles,
    ...tseslint.configs.disableTypeChecked,
  },
);
