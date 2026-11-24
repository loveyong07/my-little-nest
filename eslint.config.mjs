import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/", ".vercel/", "archive/", "qa/", "node_modules/", "vendor/picomatch/"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["public/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["api/**", "server/**", "services/**", "build/**", "scripts/**", "tests/**", "*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    // Shared by the browser bundle and the server runtimes.
    files: ["shared/**"],
    languageOptions: { globals: { URL: "readonly" } },
  },
  {
    // Functions in these files are serialized into the browser page.
    files: ["scripts/qa/**"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // The component tests install a jsdom window as the global browser environment.
    files: ["tests/components.test.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
