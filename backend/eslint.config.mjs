import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

// Third-party packages each layer is allowed to touch. Paired with the
// folder zones below, this closes the gap those zones leave open: they
// stop domain/ importing infrastructure/, but not domain/ importing
// `express` or `@prisma/client` directly.
const HTTP_PACKAGES = ['express', 'helmet', 'cors', 'cookie-parser', 'express-rate-limit', 'zod'];
const INFRA_PACKAGES = ['@prisma/client', '@prisma/adapter-pg', 'pg', 'argon2', 'jose'];
// Imported by subpath (pdfjs-dist/legacy/build/pdf.mjs), so matched as patterns.
const INFRA_PATTERNS = ['pdfjs-dist', 'pdfjs-dist/*'];
const restrict = (names, message) => names.map((name) => ({ name, message }));

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.ts'],
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
      },
    },
    rules: {
      // ---------------------------------------------------------------
      // THE DEPENDENCY RULE.
      // Dependencies point inward only: api -> infrastructure ->
      // application -> domain. Anything pointing outward is an error.
      //
      // `target` is the layer being constrained.
      // `from`   is what that layer is forbidden to import.
      // ---------------------------------------------------------------
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/domain',
              from: './src/application',
              message: 'Domain is the core and must not depend on Application.',
            },
            {
              target: './src/domain',
              from: './src/infrastructure',
              message: 'Domain must never know about databases or HTTP clients.',
            },
            {
              target: './src/domain',
              from: './src/api',
              message: 'Domain must never know about Express.',
            },
            {
              target: './src/application',
              from: './src/infrastructure',
              message:
                'Application defines interfaces; Infrastructure implements them. Depend on the interface instead.',
            },
            {
              target: './src/application',
              from: './src/api',
              message: 'Application must not depend on the HTTP layer.',
            },
            {
              target: './src/infrastructure',
              from: './src/api',
              message: 'Infrastructure must not depend on the HTTP layer.',
            },
          ],
        },
      ],

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],

      // Default for all of src/: domain and application may use NEITHER
      // group. They are plain TypeScript that could run anywhere.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...restrict(HTTP_PACKAGES, 'Only src/api may use HTTP and validation libraries.'),
            ...restrict(INFRA_PACKAGES, 'Only src/infrastructure may use database and crypto libraries.'),
          ],
          patterns: [{ group: INFRA_PATTERNS, message: 'Only src/infrastructure may read PDFs.' }],
        },
      ],
    },
  },

  {
    files: ['src/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: restrict(
            INFRA_PACKAGES,
            'The API layer reaches the database and crypto through use cases, never directly.',
          ),
          patterns: [{ group: INFRA_PATTERNS, message: 'The API layer reads PDFs through use cases, never directly.' }],
        },
      ],
    },
  },

  {
    files: ['src/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: restrict(HTTP_PACKAGES, 'Infrastructure must not depend on the HTTP layer.') },
      ],
    },
  },
);
