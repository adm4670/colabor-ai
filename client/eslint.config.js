const tsParser = require("@typescript-eslint/parser");
    const tsPlugin = require("@typescript-eslint/eslint-plugin");
    const prettierPlugin = require("eslint-plugin-prettier");
    
    module.exports = [
      {
        files: ["src/**/*.{ts,tsx}", "electron/**/*.ts"],
        languageOptions: {
          parser: tsParser,
          parserOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            ecmaFeatures: { jsx: true },
          },
        },
        plugins: {
          "@typescript-eslint": tsPlugin,
          prettier: prettierPlugin,
        },
        rules: {
          "@typescript-eslint/no-explicit-any": "warn",
          "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
          "no-console": "off",
          "no-debugger": "error",
          "eqeqeq": ["error", "always"],
          "no-var": "error",
          "prefer-const": "error",
          "prettier/prettier": ["warn", { semi: true, singleQuote: false, trailingComma: "all", printWidth: 100, tabWidth: 2 }],
        },
      },
      { ignores: ["dist/**", "dist-electron/**", "node_modules/**", "release/**", "*.js"] },
    ];
    