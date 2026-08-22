import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // `**/dist/**` and not `dist/**`: .gitignore's `dist/` matches build output at
  // any depth and ESLint's does not, so a `dist` inside a git worktree under
  // .claude/ was linted as source — 228 errors about `document` being undefined
  // in a minified bundle, which blocked `pnpm check` for reasons unrelated to any
  // change being made.
  { ignores: ['**/dist/**', 'golden/**', 'index.html', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      // `_name` marks a deliberately-unused binding (a seam kept for a known
      // future contributor, e.g. driftAccel's ambient-gravity parameters).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
