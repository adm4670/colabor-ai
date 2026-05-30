const tsParser = require("@typescript-eslint/parser");
    const tsPlugin = require("@typescript-eslint/eslint-plugin");
    const prettierPlugin = require("eslint-plugin-prettier");
    const prettierConfig = require("eslint-config-prettier");
    
    module.exports = [
      {
        files: ["src/**/*.ts"],
        languageOptions: {
          parser: tsParser,
          parserOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            project: "./tsconfig.json",
          },
        },
        plugins: {
          "@typescript-eslint": tsPlugin,
          prettier: prettierPlugin,
        },
        rules: {
          // TypeScript strict
          "@typescript-eslint/no-explicit-any": "warn",
          "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
          "@typescript-eslint/explicit-function-return-type": "off",
          "@typescript-eslint/no-non-null-assertion": "warn",
          "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
    
          // General
          "no-console": "off",
          "no-debugger": "error",
          "eqeqeq": ["error", "always"],
          "no-var": "error",
          "prefer-const": "error",
          "no-duplicate-imports": "error",
          "no-unreachable": "error",
    
          // Prettier
          "prettier/prettier": [
            "warn",
            {
              semi: true,
              singleQuote: false,
              trailingComma: "all",
              printWidth: 100,
              tabWidth: 2,
            },
          ],
        },
      },
      {
        ignores: ["dist/**", "node_modules/**", "docs/**", "__tests__/**", "*.js"],
      },
    ];
    