import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // `**/dist/**` and not `dist/**`: .gitignore's `dist/` matches build output at
  // any depth and ESLint's does not, so a `dist` inside a git worktree under
  // .claude/ was linted as source — 228 errors about `document` being undefined
  // in a minified bundle, which blocked `pnpm check` for reasons unrelated to any
  // change being made.
  // `.claude/**` holds Claude Code's own state, including git worktrees — which
  // are full checkouts of this repo and get linted on their own terms, from their
  // own branch. Linting them from here reports another branch's problems against
  // this one's working tree, which is confusing at best and blocks `pnpm check`
  // for changes that are nothing to do with it.
  // `scratch/` is gitignored and holds throwaway measurement scripts (AGENTS,
  // "thresholds are measured"). Linting them blocks `pnpm check` on code that is
  // never shipped — the same trap `dist` and `.claude` were fixed for.
  // `design/` holds Claude Design's exported canvas boards and the runtime that
  // renders them. `support.js` is a vendored bundle written against the browser,
  // so it reports 93 `document is not defined` errors — the fourth instance of
  // the same trap, and the boards are source material rather than source.
  {
    ignores: [
      '**/dist/**',
      'golden/**',
      'index.html',
      '**/node_modules/**',
      '.claude/**',
      'scratch/**',
      'design/**',
    ],
  },
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
