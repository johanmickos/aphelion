import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// TypeScript is pinned to the 6.x line in package.json rather than 7.x, and this
// file is the reason: 7.0 is the native compiler and typescript-eslint refuses to
// load against it outright ("typescript-eslint does not support TS 7.0"). The
// alternative is running two TypeScript installs side by side, one for `tsc` and
// one for the linter, which is more moving parts than a scaffold should carry.
// Revisit when typescript-eslint ships TS 7 support.

export default tseslint.config(
  {
    // `**/dist/**` and not `dist/**`: .gitignore's `dist/` matches build output
    // at any depth and ESLint's does not, so a `dist` inside a git worktree
    // under .claude/ would be linted as source.
    // `.claude/**` holds Claude Code's own state, including git worktrees —
    // full checkouts of this repo, linted on their own branch, not this one.
    // `docs/**` is author-owned: the design boards ship their own live
    // components, which are not this codebase's to restyle or to hold to its
    // rules (ADR-0002 — the boards stay canonical for appearance).
    // `test/fixtures/**` holds deliberate portability violations, kept as data
    // for the checker to be pointed at. Linting them reports the problems they
    // exist to contain.
    // `bench/` is `pnpm bench`'s output and its work tree — a copy of src/ with
    // the bench's patches applied, so linting it reports the patches.
    // `tools/bench/entry.ts` is written against that copy and is typechecked by
    // `pnpm bench` rather than from here; see tsconfig.json.
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.claude/**',
      'docs/**',
      'test/fixtures/**',
      'bench/**',
      'tools/bench/entry.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      // `_name` marks a deliberately-unused binding: a seam kept for a known
      // future contributor rather than an oversight.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
