import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

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
    },
  },
);
