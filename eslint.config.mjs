import globals from 'globals';

export default [
  { ignores: ['node_modules/**', '.next/**', '.next-*/**', 'tmp/**', '.tmp/**', 'public/**', 'avatars/**', 'coverage/**', 'out/**'] },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unsafe-finally': 'error',
      'no-unexpected-multiline': 'error',
      'valid-typeof': 'error',
    },
  },
  {
    files: ['lib/security-headers.js', 'lib/account-sync.js', 'lib/account-cache-lifecycle.js', 'lib/global-provider-budget.js'],
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'eqeqeq': 'error',
      'prefer-const': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
    },
  },
];
