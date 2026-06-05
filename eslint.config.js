import tseslint from '@typescript-eslint/eslint-plugin';
    import tsParser from '@typescript-eslint/parser';
    
    export default [
      {
        ignores: ['dist/', 'node_modules/', '*.html', 'telemetry/', '*.js'],
      },
      {
        files: ['core/**/*.ts', 'scripts/**/*.ts'],
        languageOptions: {
          parser: tsParser,
          ecmaVersion: 2022,
          sourceType: 'module',
          globals: {
            node: true,
            es2022: true,
          },
        },
        plugins: {
          '@typescript-eslint': tseslint,
        },
        rules: {
          ...tseslint.configs.recommended.rules,
          '@typescript-eslint/no-explicit-any': 'warn',
          '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
          '@typescript-eslint/no-unused-expressions': 'warn',
          '@typescript-eslint/ban-ts-comment': 'warn',
          '@typescript-eslint/no-unsafe-function-type': 'warn',
          '@typescript-eslint/no-require-imports': 'warn',
          'no-console': 'off',
          'prefer-const': 'error',
          'no-var': 'error',
        },
      },
    ];
    